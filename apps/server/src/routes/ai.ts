import { Router, Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../middleware/auth'
import { AnthropicService } from '../services/ai/anthropic.service'
import { PromptService } from '../services/ai/prompt.service'
import { WorkflowEngine } from '../services/ai/workflow.engine'
import { creditService } from '../services/credit.service'

const router = Router()

/** AI 文本输入（brief / clientText / userInput 等）的最大长度，超出直接拒绝，避免费用攻击 */
const MAX_AI_TEXT_LENGTH = 8000

/**
 * 校验并截断 AI 文本输入。
 * @returns 若合法返回截断后（含首尾空白去除）的字符串；否则返回 null（调用方应返回 400）。
 */
function validateAiText(value: unknown, field: string): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const trimmed = value.trim()
  if (trimmed.length > MAX_AI_TEXT_LENGTH) return null
  return trimmed
}

const anthropic = new AnthropicService()
const promptService = new PromptService(anthropic)
const workflowEngine = new WorkflowEngine(anthropic)

/**
 * 补偿型积分操作（refund）失败时的错误记录。
 * 这些操作在 try/catch 内执行，失败不应中断主流程，但必须留痕以便对账。
 */
function logCreditError(action: string, userId: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err)
  console.error(`[ai][credit] ${action} 失败 userId=${userId}: ${msg}`)
}

/**
 * POST /api/ai/brief
 * 生成广告 Brief。消耗 1 积分（先冻结，成功后扣减，失败则退回）。
 */
router.post('/brief', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { businessType, clientText, constraints } = req.body ?? {}
    if (!businessType || typeof businessType !== 'string' || !businessType.trim()) {
      return res.status(400).json({ code: 400, message: 'businessType 为必填项', data: null })
    }
    const safeClientText = validateAiText(clientText, 'clientText')
    if (!safeClientText) {
      return res.status(400).json({
        code: 400,
        message: `clientText 为必填项且长度不超过 ${MAX_AI_TEXT_LENGTH} 字符`,
        data: null,
      })
    }
    const userId = req.user!.id

    // 直接冻结：freeze 在事务内校验余额，避免「先查后冻」竞态
    try {
      await creditService.freeze(userId, 1, { reason: '生成广告 Brief', relatedType: 'ai_brief' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('不足')) {
        return res.status(400).json({ code: 400, message: '可用积分不足，无法生成广告 Brief', data: null })
      }
      return next(err)
    }
    try {
      const result = await anthropic.generateBrief({
        businessType: businessType.trim(),
        clientText: safeClientText,
        constraints,
      })
      await creditService.consume(userId, 1, { reason: '生成广告 Brief', relatedType: 'ai_brief' })
      return res.json({ code: 0, message: 'ok', data: result })
    } catch (innerErr) {
      // 生成失败，退回冻结积分
      await creditService
        .refund(userId, 1, { reason: '生成广告 Brief 失败退回', relatedType: 'ai_brief' })
        .catch((e) => logCreditError('refund', userId, e))
      return next(innerErr)
    }
  } catch (err) {
    return next(err)
  }
})

/**
 * POST /api/ai/prompt
 * 基于 Brief 优化生图提示词。消耗 1 积分。
 */
router.post('/prompt', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { brief, stylePreference } = req.body ?? {}
    if (!brief) {
      return res.status(400).json({ code: 400, message: 'brief 为必填项', data: null })
    }
    // brief 为结构化对象，按序列化后长度做防御性限制，避免过大造成费用攻击
    const briefSize = typeof brief === 'string' ? brief.length : JSON.stringify(brief).length
    if (briefSize > MAX_AI_TEXT_LENGTH) {
      return res.status(400).json({
        code: 400,
        message: `brief 过长，序列化后不超过 ${MAX_AI_TEXT_LENGTH} 字符`,
        data: null,
      })
    }
    const userId = req.user!.id

    try {
      await creditService.freeze(userId, 1, { reason: '优化生图提示词', relatedType: 'ai_prompt' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('不足')) {
        return res.status(400).json({ code: 400, message: '可用积分不足，无法优化提示词', data: null })
      }
      return next(err)
    }
    try {
      const result = await promptService.optimizePrompt(brief, stylePreference)
      await creditService.consume(userId, 1, { reason: '优化生图提示词', relatedType: 'ai_prompt' })
      return res.json({ code: 0, message: 'ok', data: result })
    } catch (innerErr) {
      await creditService
        .refund(userId, 1, { reason: '优化生图提示词失败退回', relatedType: 'ai_prompt' })
        .catch((e) => logCreditError('refund', userId, e))
      return next(innerErr)
    }
  } catch (err) {
    return next(err)
  }
})

/**
 * POST /api/ai/workflows/run
 * 执行完整的 Agency Workflow Skills 6 步流程。
 * 文本步骤（AE / 策略 / 创意 / BOSS）共冻结 4 积分；异步步骤（生图 / 合成）由 Worker 单独计费。
 */
router.post('/workflows/run', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId, userInput } = req.body ?? {}
    if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
      return res.status(400).json({ code: 400, message: 'projectId 为必填项', data: null })
    }
    // userInput 可选；若提供则做长度校验，超长直接拒绝（避免费用攻击）
    let safeUserInput = ''
    if (userInput != null) {
      const v = validateAiText(userInput, 'userInput')
      if (!v) {
        return res.status(400).json({
          code: 400,
          message: `userInput 长度不超过 ${MAX_AI_TEXT_LENGTH} 字符`,
          data: null,
        })
      }
      safeUserInput = v
    }
    const userId = req.user!.id

    // 文本步骤积分（4 步）
    const TEXT_STEPS_CREDIT = 4
    // 直接冻结：freeze 在事务内校验余额，避免「先查后冻」竞态
    try {
      await creditService.freeze(userId, TEXT_STEPS_CREDIT, {
        reason: '运行 Agency 工作流',
        relatedType: 'workflow',
        relatedId: projectId,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('不足')) {
        return res.status(400).json({
          code: 400,
          message: `可用积分不足，执行工作流需要 ${TEXT_STEPS_CREDIT} 积分`,
          data: null,
        })
      }
      return next(err)
    }
    try {
      const steps = await workflowEngine.runFullWorkflow(projectId, safeUserInput || '')
      await creditService.consume(userId, TEXT_STEPS_CREDIT, {
        reason: '运行 Agency 工作流',
        relatedType: 'workflow',
        relatedId: projectId,
      })
      return res.json({ code: 0, message: 'ok', data: { projectId, steps } })
    } catch (innerErr) {
      await creditService
        .refund(userId, TEXT_STEPS_CREDIT, {
          reason: '运行工作流失败退回',
          relatedType: 'workflow',
          relatedId: projectId,
        })
        .catch((e) => logCreditError('refund', userId, e))
      return next(innerErr)
    }
  } catch (err) {
    return next(err)
  }
})

export const aiRoutes = router
