import { Router, Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../middleware/auth'
import { prisma, imageQueue, env } from '../config'
import { creditService } from '../services/credit.service'

const router = Router()

/** 生图 prompt 最大长度，超出直接拒绝，避免费用攻击与出图质量受损 */
const MAX_PROMPT_LENGTH = 4000

/**
 * 比例 -> 生图尺寸映射
 */
const RATIO_TO_SIZE: Record<string, string> = {
  '1:1': '1024x1024',
  '3:4': '768x1024',
  '9:16': '768x1365',
  '16:9': '1365x768',
  '4:3': '1024x768',
}

/**
 * 解析请求中的比例，缺省 1:1。
 */
function resolveSize(ratio?: string): string {
  if (ratio && RATIO_TO_SIZE[ratio]) return RATIO_TO_SIZE[ratio]
  return '1024x1024'
}

/**
 * POST /api/image-jobs
 * 提交异步生图任务：校验并冻结积分 -> 创建 GenerationJob -> 入 BullMQ 队列。
 */
router.post('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId, prompt, count, ratio, model } = req.body ?? {}
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ code: 400, message: 'prompt 为必填项', data: null })
    }
    // 防御性长度校验：超长直接拒绝
    const safePrompt = prompt.trim()
    if (safePrompt.length > MAX_PROMPT_LENGTH) {
      return res.status(400).json({
        code: 400,
        message: `prompt 过长，最大 ${MAX_PROMPT_LENGTH} 字符`,
        data: null,
      })
    }
    const userId = req.user!.id

    const n = Math.min(Math.max(parseInt(String(count || '1'), 10) || 1, 1), 4)
    const size = resolveSize(ratio)
    const creditCost = n * 2 // 每张 2 积分

    // 直接冻结积分：freeze 在数据库事务内校验余额，
    // 避免「先 getBalance 再 freeze」之间的 TOCTOU 竞态导致超额冻结。
    try {
      await creditService.freeze(userId, creditCost, {
        reason: '提交生图任务',
        relatedType: 'job',
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('不足')) {
        return res.status(400).json({
          code: 400,
          message: `可用积分不足，本次生图需要 ${creditCost} 积分`,
          data: null,
        })
      }
      return next(err)
    }

    // 创建 GenerationJob 记录
    const genJob = await prisma.generationJob.create({
      data: {
        userId,
        projectId: projectId || null,
        provider: 'openai',
        model: model || env.openaiImageModel,
        jobType: 'image_generation',
        status: 'queued',
        prompt: safePrompt,
        requestJson: { count: n, ratio, size },
        creditsFrozen: creditCost,
      },
    })

    // 加入 BullMQ 队列
    await imageQueue.add('generate', {
      jobId: genJob.id,
      userId,
      projectId: projectId || null,
      prompt: safePrompt,
      count: n,
      model: genJob.model,
      ratio,
      size,
      creditsFrozen: creditCost,
    })

    return res.json({ code: 0, message: 'ok', data: { jobId: genJob.id, status: 'queued' } })
  } catch (err) {
    return next(err)
  }
})

/**
 * GET /api/image-jobs/:id
 * 查询生成任务完整信息（含结果）。
 */
router.get('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params
    const userId = req.user!.id
    const job = await prisma.generationJob.findFirst({ where: { id, userId } })
    if (!job) {
      return res.status(404).json({ code: 404, message: '任务不存在或无权访问', data: null })
    }

    // 直接复用 Worker 写入 responseJson 的精确结果集，
    // 避免按 projectId 拉取全部 generated_design 资产导致不同任务串味。
    let results: unknown[] = []
    if (job.status === 'succeeded') {
      results = ((job.responseJson as { results?: unknown[] } | null)?.results ?? []) as unknown[]
    }

    return res.json({
      code: 0,
      message: 'ok',
      data: {
        id: job.id,
        status: job.status,
        provider: job.provider,
        model: job.model,
        jobType: job.jobType,
        prompt: job.prompt,
        requestJson: job.requestJson,
        responseJson: job.responseJson,
        errorMessage: job.errorMessage,
        creditsFrozen: job.creditsFrozen,
        creditsConsumed: job.creditsConsumed,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        createdAt: job.createdAt,
        results,
      },
    })
  } catch (err) {
    return next(err)
  }
})

export const imageJobRoutes = router
