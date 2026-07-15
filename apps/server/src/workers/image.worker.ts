import { Worker, Job } from 'bullmq'
import { redisConnection, imageQueue, compositionQueue, prisma, env } from '../config'
import { OpenAIImageService } from '../services/ai/openai-image.service'
import { CompositionService } from '../services/ai/composition.service'
import { CreditService } from '../services/credit.service'
import { saveBuffer, getStorageDir } from '../utils/storage'
import path from 'path'
import { emitJobProgress } from './progress'
import { enqueueCreditCompensation, processCreditDlq } from './credit-compensation'

const imageService = new OpenAIImageService()
const compositionService = new CompositionService()
const creditService = new CreditService()

/**
 * 延时工具（轮询生图结果时使用）
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ============================================================
// 进度事件（轻量）
// ============================================================
function emitProgress(jobId: string, stage: 'submitted' | 'polling' | 'downloading' | 'saving' | 'done' | 'failed', percent: number, message?: string): void {
  emitJobProgress({ jobId, stage, percent, message })
}

// ============================================================
// 通用 helper：超时 / 重试（外部 AI 网关是单点依赖，需防止挂死）
// ============================================================

/**
 * 给一个 Promise 包一层超时。超时即 reject，避免上游网关无响应时 Worker 永久挂起。
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} 超时（${ms}ms）`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/**
 * 带超时与退避重试的 fetch（仅对网络异常 / 5xx 重试，4xx 视为终态直接返回）。
 */
async function fetchWithRetry(url: string, timeoutMs: number, retries: number): Promise<Response> {
  let lastErr: unknown
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await withTimeout(fetch(url), timeoutMs, '图片下载')
      if (!resp.ok && resp.status >= 400 && resp.status < 500) return resp // 终态，不重试
      if (resp.ok) return resp
    } catch (err) {
      lastErr = err
    }
    if (i < retries) await sleep(1000 * (i + 1))
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

// ============================================================
// 失败路径 DB 更新：有界重试 + 最终失败 re-throw
// ============================================================

/**
 * 把任务标记为 failed 的 DB 更新，带 3 次有界重试。
 * 仍失败则 console.error 并抛错，交由外层 catch 重新 throw —— 让 BullMQ 的 failed handler
 * 重试整个任务（避免任务永远停在 'processing' 卡死）。
 */
async function markJobFailedWithRetry(
  jobId: string,
  data: { finishedAt: Date; errorMessage: string },
): Promise<void> {
  const maxRetries = 3
  let lastErr: unknown
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await prisma.generationJob.update({
        where: { id: jobId },
        data: { status: 'failed', finishedAt: data.finishedAt, errorMessage: data.errorMessage },
      })
      return
    } catch (err) {
      lastErr = err
      console.error(
        `[worker][db] 更新任务 ${jobId} 为 failed 重试 ${attempt + 1}/${maxRetries} 失败:`,
        err instanceof Error ? err.message : err,
      )
      if (attempt < maxRetries - 1) await sleep(500 * (attempt + 1))
    }
  }
  console.error(
    `[worker][db] 更新任务 ${jobId} 为 failed 彻底失败，交由 BullMQ 重试:`,
    lastErr instanceof Error ? lastErr.message : lastErr,
  )
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

/** 单张图片下载大小上限，防止异常响应（错误页 / 超大图）撑爆 Worker 内存 */
const MAX_IMAGE_SIZE = 20 * 1024 * 1024 // 20MB

/**
 * 从图片 URL 或 base64 下载内容到 Buffer（带超时 + 重试）。
 */
async function fetchImageBuffer(item: { url?: string; b64_json?: string }): Promise<Buffer> {
  if (item.b64_json) {
    const buf = Buffer.from(item.b64_json, 'base64')
    if (buf.length > MAX_IMAGE_SIZE) {
      throw new Error(`生图结果过大（${buf.length} bytes），超过 ${MAX_IMAGE_SIZE} 限制`)
    }
    return buf
  }
  if (item.url) {
    const resp = await fetchWithRetry(item.url, 30_000, 2)
    if (!resp.ok) throw new Error(`下载生成图片失败（HTTP ${resp.status}）`)
    // 优先用 Content-Length 提前拦截超大响应
    const contentLength = parseInt(resp.headers.get('content-length') || '0', 10)
    if (contentLength > MAX_IMAGE_SIZE) {
      throw new Error(`图片过大（${contentLength} bytes），超过 ${MAX_IMAGE_SIZE} 限制`)
    }
    const buf = Buffer.from(await resp.arrayBuffer())
    if (buf.length > MAX_IMAGE_SIZE) {
      throw new Error(`图片实际大小 ${buf.length} 超过 ${MAX_IMAGE_SIZE} 限制`)
    }
    return buf
  }
  throw new Error('生图结果既无 url 也无 b64_json')
}

// ============================================================
// 图片生成 Worker
// ============================================================
const imageWorker = new Worker(
  'image-generation',
  async (job: Job) => {
    const { jobId, userId, projectId, prompt, count, model, size, ratio, creditsFrozen } = job.data
    const parsedCredits = Number(creditsFrozen)
    const credits = Number.isFinite(parsedCredits) ? parsedCredits : count * 2

    try {
      const existing = await prisma.generationJob.findUnique({ where: { id: jobId }, select: { status: true } })
      if (existing?.status === 'paused' || existing?.status === 'canceled') {
        return { status: existing.status }
      }
      // 1. 更新状态为 processing
      await prisma.generationJob.update({
        where: { id: jobId },
        data: { status: 'processing', startedAt: new Date() },
      })

      // 2. 提交异步生图任务（单外部依赖，包超时保护）
      const { taskId } = await withTimeout(
        imageService.submitJob(prompt, { model, size, n: count }),
        60_000,
        '提交生图任务',
      )

      // 3. 轮询等待结果（最长 10 分钟）
      let status: 'pending' | 'succeeded' | 'failed' = 'pending'
      let results: Array<{ url?: string; b64_json?: string }> = []
      let errorMsg: string | undefined
      const deadline = Date.now() + 10 * 60 * 1000
      const pollStart = Date.now()
      emitProgress(jobId, 'submitted', 5)
      while (Date.now() < deadline) {
        await sleep(3000)
        const poll = await withTimeout(imageService.pollStatus(taskId), 30_000, '轮询生图状态')
        status = poll.status
        if (status === 'succeeded') {
          results = poll.results || []
          break
        }
        if (status === 'failed') {
          errorMsg = poll.error
          break
        }
        // 轮询中：按已用时长估算 10~65%
        const frac = Math.min((Date.now() - pollStart) / (10 * 60 * 1000), 1)
        emitProgress(jobId, 'polling', Math.round(10 + frac * 55))
      }
      if (status !== 'succeeded') {
        throw new Error(errorMsg || '生图任务超时或失败')
      }

      const beforeSave = await prisma.generationJob.findUnique({ where: { id: jobId }, select: { status: true } })
      if (beforeSave?.status === 'paused' || beforeSave?.status === 'canceled') {
        return { status: beforeSave.status }
      }

      // 4. 下载图片、落盘、创建 Asset
      emitProgress(jobId, 'downloading', 70)
      const assets: Array<{ assetId: string; url: string }> = []
      for (const item of results) {
        const buffer = await fetchImageBuffer(item)
        const { filename, url } = await saveBuffer(buffer, 'png')
        const asset = await prisma.asset.create({
          data: {
            userId,
            projectId: projectId || null,
            generationJobId: jobId,
            type: 'generated_design',
            storageKey: filename,
            url,
            mimeType: 'image/png',
            metadataJson: { prompt, model, ratio, source: 'openai_image' },
          },
        })
        assets.push({ assetId: asset.id, url })
      }

      // 5. 扣减冻结积分（同步，先于标记成功）——避免「先标记成功再异步扣减」窗口期内的白嫖（F4）。
      //    扣减失败（冻结余额异常等）则标记任务失败并向上抛，由失败补偿链路处理冻结积分。
      emitProgress(jobId, 'saving', 90)
      const beforeConsume = await prisma.generationJob.findUnique({ where: { id: jobId }, select: { status: true } })
      if (beforeConsume?.status === 'paused' || beforeConsume?.status === 'canceled') {
        return { status: beforeConsume.status }
      }
      if (credits > 0) {
        try {
          await creditService.consume(userId, credits, {
            reason: '生图任务完成',
            relatedType: 'job',
            relatedId: jobId,
          })
        } catch (consumeErr) {
          await markJobFailedWithRetry(jobId, {
            finishedAt: new Date(),
            errorMessage: consumeErr instanceof Error ? consumeErr.message : String(consumeErr),
          }).catch(() => {})
          throw consumeErr
        }
      }
      await prisma.generationJob.update({
        where: { id: jobId },
        data: {
          status: 'succeeded',
          finishedAt: new Date(),
          responseJson: { taskId, results: assets },
          creditsConsumed: credits,
        },
      })

      emitProgress(jobId, 'done', 100)
      return { status: 'succeeded', results: assets }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // 失败：先同步标记失败（有界重试），再同步释放冻结积分（F4）。
      // 两步均失败时才退回补偿队列（best-effort），避免「标记成功但扣减丢失」式的资金泄漏。
      try {
        await markJobFailedWithRetry(jobId, { finishedAt: new Date(), errorMessage: msg })
      } catch (dbErr) {
        if (credits > 0) {
          try {
            await creditService.refund(userId, credits, {
              reason: '生图失败退回积分',
              relatedType: 'job',
              relatedId: jobId,
            })
          } catch {
            await enqueueCreditCompensation({
              type: 'refund',
              userId,
              credits,
              reason: '生图失败退回积分',
              relatedType: 'job',
              relatedId: jobId,
            })
          }
        }
        throw dbErr
      }
      if (credits > 0) {
        try {
          await creditService.refund(userId, credits, {
            reason: '生图失败退回积分',
            relatedType: 'job',
            relatedId: jobId,
          })
        } catch {
          await enqueueCreditCompensation({
            type: 'refund',
            userId,
            credits,
            reason: '生图失败退回积分',
            relatedType: 'job',
            relatedId: jobId,
          })
        }
      }
      emitProgress(jobId, 'failed', 100, msg)
      throw err
    }
  },
  { connection: redisConnection as any },
)

// ============================================================
// 环境合成 Worker（sharp 图像处理）
// ============================================================
const compositionWorker = new Worker(
  'composition',
  async (job: Job) => {
    const { jobId, userId, projectId, environmentAssetId, designAssetId, position, outputFormat, creditsFrozen } =
      job.data
    const parsedCredits = Number(creditsFrozen)
    const credits = Number.isFinite(parsedCredits) ? parsedCredits : 1

    try {
      const existing = await prisma.generationJob.findUnique({ where: { id: jobId }, select: { status: true } })
      if (existing?.status === 'paused' || existing?.status === 'canceled') {
        return { status: existing.status }
      }
      await prisma.generationJob.update({
        where: { id: jobId },
        data: { status: 'processing', startedAt: new Date(), jobType: 'composition' },
      })

      const envAsset = await prisma.asset.findUnique({ where: { id: environmentAssetId } })
      const designAsset = await prisma.asset.findUnique({ where: { id: designAssetId } })
      if (!envAsset || !designAsset) throw new Error('环境图或设计图不存在')

      const envPath = path.join(getStorageDir(), envAsset.storageKey)
      const designPath = path.join(getStorageDir(), designAsset.storageKey)

      emitProgress(jobId, 'submitted', 5)
      emitProgress(jobId, 'saving', 90)
      const result = await compositionService.composeToEnvironment(
        {
          environmentImagePath: envPath,
          designImagePath: designPath,
          position,
          outputFormat: outputFormat === 'jpeg' ? 'jpeg' : 'png',
        },
        { userId, projectId, generationJobId: jobId },
      )

      const beforeConsume = await prisma.generationJob.findUnique({ where: { id: jobId }, select: { status: true } })
      if (beforeConsume?.status === 'paused' || beforeConsume?.status === 'canceled') {
        return { status: beforeConsume.status }
      }

      // 扣减冻结积分（同步，先于标记成功），失败则标记失败并向上抛（F4）
      if (credits > 0) {
        try {
          await creditService.consume(userId, credits, {
            reason: '环境合成完成',
            relatedType: 'job',
            relatedId: jobId,
          })
        } catch (consumeErr) {
          await markJobFailedWithRetry(jobId, {
            finishedAt: new Date(),
            errorMessage: consumeErr instanceof Error ? consumeErr.message : String(consumeErr),
          }).catch(() => {})
          throw consumeErr
        }
      }
      await prisma.generationJob.update({
        where: { id: jobId },
        data: {
          status: 'succeeded',
          finishedAt: new Date(),
          responseJson: { assetId: result.assetId, url: result.url },
          creditsConsumed: credits,
        },
      })

      emitProgress(jobId, 'done', 100)
      return { status: 'succeeded', assetId: result.assetId, url: result.url }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // 失败：先同步标记失败（有界重试），再同步释放冻结积分（F4）；两步均失败才退回补偿队列。
      try {
        await markJobFailedWithRetry(jobId, { finishedAt: new Date(), errorMessage: msg })
      } catch (dbErr) {
        if (credits > 0) {
          try {
            await creditService.refund(userId, credits, {
              reason: '环境合成失败退回积分',
              relatedType: 'job',
              relatedId: jobId,
            })
          } catch {
            await enqueueCreditCompensation({
              type: 'refund',
              userId,
              credits,
              reason: '环境合成失败退回积分',
              relatedType: 'job',
              relatedId: jobId,
            })
          }
        }
        throw dbErr
      }
      if (credits > 0) {
        try {
          await creditService.refund(userId, credits, {
            reason: '环境合成失败退回积分',
            relatedType: 'job',
            relatedId: jobId,
          })
        } catch {
          await enqueueCreditCompensation({
            type: 'refund',
            userId,
            credits,
            reason: '环境合成失败退回积分',
            relatedType: 'job',
            relatedId: jobId,
          })
        }
      }
      emitProgress(jobId, 'failed', 100, msg)
      throw err
    }
  },
  { connection: redisConnection as any },
)

// 运行日志
imageWorker.on('ready', () => console.log('[image-worker] ✅ 已连接 Redis，监听队列 image-generation'))
imageWorker.on('completed', (job) => console.log(`[image-worker] ✅ job ${job?.id} 完成`))
imageWorker.on('failed', (job, err) => {
  console.error(`[image-worker] ❌ job ${job?.id} failed:`, err?.message)
})
compositionWorker.on('ready', () => console.log('[composition-worker] ✅ 已连接 Redis，监听队列 composition'))
compositionWorker.on('completed', (job) => console.log(`[composition-worker] ✅ job ${job?.id} 完成`))
compositionWorker.on('failed', (job, err) => {
  console.error(`[composition-worker] ❌ job ${job?.id} failed:`, err?.message)
})

console.log('🔄 AdCraft Worker 启动中（image-generation + composition）...')

// 优雅关闭
async function shutdown(signal: string) {
  console.log(`\n[worker] 收到 ${signal}，正在关闭...`)
  try {
    await imageWorker.close()
    await compositionWorker.close()
  } finally {
    process.exit(0)
  }
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

// 暴露契约（其它 agent / 模块消费）：
//  - jobProgressEmitter：见 ./progress
//  - enqueueCreditCompensation / processCreditDlq：见 ./credit-compensation
export { imageWorker, compositionWorker }
export { jobProgressEmitter } from './progress'
export { enqueueCreditCompensation, processCreditDlq } from './credit-compensation'
