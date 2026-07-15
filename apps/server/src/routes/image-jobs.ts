import { Router, Request, Response, NextFunction } from 'express'
import sharp from 'sharp'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { prisma, imageQueue, env } from '../config'
import { creditService } from '../services/credit.service'
import { creditRuleService } from '../services/credit-rule.service'
import { textValidationService, TextValidationRecord } from '../services/ai/text-validation.service'
import { textCorrectionService } from '../services/ai/text-correction.service'
import { saveBuffer } from '../utils/storage'

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

function normalizeRequiredVisibleTexts(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value
    .map((item) => String(item || '').trim().replace(/\s+/g, ' '))
    .filter((item) => item.length > 0 && item.length <= 80)
    .filter((item) => {
      const key = item.toLocaleLowerCase().replace(/\s+/g, '')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 8)
}

function responseObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function requestObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

async function getSourceAsset(jobId: string, jobType: string) {
  const preferredTypes =
    jobType === 'composition' ? ['composited_preview', 'corrected'] : ['generated_design', 'corrected']
  return prisma.asset.findFirst({
    where: {
      generationJobId: jobId,
      type: { in: preferredTypes },
    },
    orderBy: { createdAt: 'desc' },
  })
}

function escapeSvgText(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    }
    return entities[character] || character
  })
}

async function createMockImage(prompt: string, requiredVisibleTexts: string[]) {
  const title = requiredVisibleTexts[0] || 'AdCraft AI'
  const subtitle = prompt.slice(0, 120)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#f8fafc"/><rect x="160" y="160" width="880" height="360" rx="28" fill="#ffffff" stroke="#1f2937" stroke-width="8"/><text x="600" y="340" text-anchor="middle" font-family="Arial, Microsoft YaHei, sans-serif" font-size="76" font-weight="700" fill="#111827">${escapeSvgText(title)}</text><text x="600" y="430" text-anchor="middle" font-family="Arial, Microsoft YaHei, sans-serif" font-size="30" fill="#64748b">AdCraft mock preview</text><text x="600" y="650" text-anchor="middle" font-family="Arial, Microsoft YaHei, sans-serif" font-size="22" fill="#475569">${escapeSvgText(subtitle)}</text></svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

/**
 * POST /api/image-jobs
 * 提交异步生图任务：校验并冻结积分 -> 创建 GenerationJob -> 入 BullMQ 队列。
 */
router.post('/', requirePermission('canGenerate'), async (req: Request, res: Response, next: NextFunction) => {
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

    // 归属校验：若提供了 projectId，必须属于当前用户，否则写 IDOR（可把生成资产写入他人项目）
    if (projectId) {
      const project = await prisma.project.findFirst({ where: { id: projectId, userId } })
      if (!project) {
        return res.status(403).json({ code: 403, message: '无权向该项目的任务提交生图任务', data: null })
      }
    }

    const n = Math.min(Math.max(parseInt(String(count || '1'), 10) || 1, 1), 4)
    const size = resolveSize(ratio)
    const imageCreditCost = await creditRuleService.getCost('imageGeneration')
    // 生产护栏：仅当显式设置 ALLOW_MOCK=true 时才允许 mock 短路；
    // 否则即使请求体携带 mock:true 也强制走真实生图路径（生产永不可被 mock）。
    const allowMock = process.env.ALLOW_MOCK === 'true'
    const mock = req.body?.mock === true && allowMock
    const creditCost = mock ? 0 : n * imageCreditCost
    // 生成消耗按积分规则标准扣减；代理 0.7 仅用于充值付款金额，不影响消费积分。
    const requiredVisibleTexts = normalizeRequiredVisibleTexts(req.body?.requiredVisibleTexts)

    if (mock) {
      const genJob = await prisma.generationJob.create({
        data: {
          userId,
          projectId: projectId || null,
          provider: 'local',
          model: 'mock-image',
          jobType: 'image_generation',
          status: 'succeeded',
          prompt: safePrompt,
          requestJson: { count: 1, ratio, size, creditUnitCost: 0, requiredVisibleTexts, mock: true },
          creditsFrozen: 0,
          creditsConsumed: 0,
          startedAt: new Date(),
          finishedAt: new Date(),
        },
      })
      const buffer = await createMockImage(safePrompt, requiredVisibleTexts)
      const { filename, url } = await saveBuffer(buffer, 'png')
      const asset = await prisma.asset.create({
        data: {
          userId,
          projectId: projectId || null,
          generationJobId: genJob.id,
          type: 'generated_design',
          storageKey: filename,
          url,
          mimeType: 'image/png',
          size: buffer.length,
          metadataJson: { prompt: safePrompt, model: 'mock-image', ratio, source: 'mock' },
        },
      })
      await prisma.generationJob.update({
        where: { id: genJob.id },
        data: { responseJson: { taskId: 'mock', results: [{ assetId: asset.id, url: asset.url }] } as any },
      })
      return res.json({ code: 0, message: 'ok', data: { jobId: genJob.id, status: 'succeeded' } })
    }

    // 直接冻结积分：freeze 在数据库事务内（行锁）校验余额，
    // 避免「先 getBalance 再 freeze」之间的 TOCTOU 竞态导致超额冻结。
    // 余额不足时 creditService 抛 InsufficientBalanceError（AppError, 400），全局错误处理直接返回 400（F7）。
    if (creditCost > 0) {
      try {
        await creditService.freeze(userId, creditCost, {
          reason: '提交生图任务',
          relatedType: 'job',
        })
      } catch (err) {
        return next(err)
      }
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
        requestJson: { count: n, ratio, size, creditUnitCost: imageCreditCost, requiredVisibleTexts },
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

    // results 来源优先级：
    // 1) Worker 写入 responseJson.results（首要来源，精确对应本任务）；
    // 2) 仅当 responseJson 无结果时，按 generationJobId 回查本批次资产
    //    （Agent B 新增字段），彻底避免按 projectId 拉取导致跨批次图片串味。
    let results: unknown[] = []
    if (job.status === 'succeeded') {
      const fromJson = (job.responseJson as { results?: unknown[] } | null)?.results
      if (Array.isArray(fromJson) && fromJson.length > 0) {
        results = fromJson
      } else {
        const assets = await prisma.asset.findMany({
          where: { generationJobId: job.id },
          take: 20,
        })
        results = assets
      }
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

router.post('/:id/text-validation', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params
    const userId = req.user!.id
    const job = await prisma.generationJob.findFirst({ where: { id, userId } })
    if (!job) {
      return res.status(404).json({ code: 404, message: '任务不存在或无权访问', data: null })
    }
    if (job.status !== 'succeeded') {
      return res.status(409).json({ code: 409, message: '文字校验需要任务已完成', data: null })
    }
    const reqJson = requestObject(job.requestJson)
    const expectedTexts = normalizeRequiredVisibleTexts(reqJson.requiredVisibleTexts)
    const sourceAsset = await getSourceAsset(job.id, job.jobType)
    const textValidation = await textValidationService.validate(expectedTexts, sourceAsset)
    const nextResponse = { ...responseObject(job.responseJson), textValidation }
    const updated = await prisma.generationJob.update({
      where: { id: job.id },
      data: { responseJson: nextResponse as any },
    })
    return res.json({ code: 0, message: 'ok', data: { job: updated, textValidation } })
  } catch (err) {
    return next(err)
  }
})

router.post('/:id/text-corrections', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params
    const userId = req.user!.id
    const job = await prisma.generationJob.findFirst({ where: { id, userId } })
    if (!job) {
      return res.status(404).json({ code: 404, message: '任务不存在或无权访问', data: null })
    }
    if (job.status !== 'succeeded') {
      return res.status(409).json({ code: 409, message: '文字重绘需要任务已完成', data: null })
    }

    const reqJson = requestObject(job.requestJson)
    const resJson = responseObject(job.responseJson)
    const expectedTexts = normalizeRequiredVisibleTexts(reqJson.requiredVisibleTexts)
    const sourceAsset = await getSourceAsset(job.id, job.jobType)
    if (!sourceAsset) {
      return res.status(409).json({ code: 409, message: '未找到可重绘的本地图片素材', data: null })
    }

    const result = await textCorrectionService.apply({
      userId,
      projectId: job.projectId,
      generationJobId: job.id,
      sourceAsset,
      expectedTexts,
      textValidation: resJson.textValidation as TextValidationRecord | undefined,
      corrections: Array.isArray(req.body?.corrections) ? req.body.corrections : [],
    })
    const existingCorrectedAssets = Array.isArray(resJson.correctedAssets) ? resJson.correctedAssets : []
    const correctedAssets = [...existingCorrectedAssets, result.asset].slice(-5)
    const nextResponse = {
      ...resJson,
      textCorrections: result.corrections,
      correctedAssets,
    }
    const updated = await prisma.generationJob.update({
      where: { id: job.id },
      data: { responseJson: nextResponse as any },
    })
    return res.json({ code: 0, message: 'ok', data: { job: updated, asset: result.asset } })
  } catch (err) {
    return next(err)
  }
})

export const imageJobRoutes = router
