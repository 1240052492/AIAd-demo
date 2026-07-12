import { Worker, Job } from 'bullmq'
import { redisConnection, imageQueue, compositionQueue, prisma, env } from '../config'
import { OpenAIImageService } from '../services/ai/openai-image.service'
import { CompositionService } from '../services/ai/composition.service'
import { CreditService } from '../services/credit.service'
import { saveBuffer, getStorageDir } from '../utils/storage'
import path from 'path'

const imageService = new OpenAIImageService()
const compositionService = new CompositionService()
const creditService = new CreditService()

/**
 * 延时工具（轮询生图结果时使用）
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 补偿型积分操作（consume / refund）失败时的错误记录。
 * 这些操作不允许抛错中断主流程（任务状态已落库），但必须留痕以便对账。
 */
function logCreditError(action: string, jobId: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err)
  console.error(`[worker][credit] ${action} 失败 jobId=${jobId}: ${msg}`)
}

/** 单张图片下载大小上限，防止异常响应（错误页 / 超大图）撑爆 Worker 内存 */
const MAX_IMAGE_SIZE = 20 * 1024 * 1024 // 20MB

/**
 * 从图片 URL 或 base64 下载内容到 Buffer。
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
    const resp = await fetch(item.url)
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
    const credits = Number(creditsFrozen) || count * 2

    try {
      // 1. 更新状态为 processing
      await prisma.generationJob.update({
        where: { id: jobId },
        data: { status: 'processing', startedAt: new Date() },
      })

      // 2. 提交异步生图任务
      const { taskId } = await imageService.submitJob(prompt, { model, size, n: count })

      // 3. 轮询等待结果（最长 10 分钟）
      let status: 'pending' | 'succeeded' | 'failed' = 'pending'
      let results: Array<{ url?: string; b64_json?: string }> = []
      let errorMsg: string | undefined
      const deadline = Date.now() + 10 * 60 * 1000
      while (Date.now() < deadline) {
        await sleep(3000)
        const poll = await imageService.pollStatus(taskId)
        status = poll.status
        if (status === 'succeeded') {
          results = poll.results || []
          break
        }
        if (status === 'failed') {
          errorMsg = poll.error
          break
        }
      }
      if (status !== 'succeeded') {
        throw new Error(errorMsg || '生图任务超时或失败')
      }

      // 4. 下载图片、落盘、创建 Asset
      const assets: Array<{ assetId: string; url: string }> = []
      for (const item of results) {
        const buffer = await fetchImageBuffer(item)
        const { filename, url } = await saveBuffer(buffer, 'png')
        const asset = await prisma.asset.create({
          data: {
            userId,
            projectId: projectId || null,
            type: 'generated_design',
            storageKey: filename,
            url,
            mimeType: 'image/png',
            metadataJson: { prompt, model, ratio, source: 'openai_image' },
          },
        })
        assets.push({ assetId: asset.id, url })
      }

      // 5. 更新任务为成功并扣减积分
      await prisma.generationJob.update({
        where: { id: jobId },
        data: {
          status: 'succeeded',
          finishedAt: new Date(),
          responseJson: { taskId, results: assets },
          creditsConsumed: credits,
        },
      })
      await creditService
        .consume(userId, credits, { reason: '生图任务完成', relatedType: 'job', relatedId: jobId })
        .catch((e) => logCreditError('consume', jobId, e))

      return { status: 'succeeded', results: assets }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // 失败：更新状态 + 释放冻结积分
      await prisma.generationJob
        .update({ where: { id: jobId }, data: { status: 'failed', finishedAt: new Date(), errorMessage: msg } })
        .catch((e) =>
          console.error(`[worker][db] 更新任务 ${jobId} 为 failed 失败:`, e instanceof Error ? e.message : e),
        )
      if (credits > 0) {
        await creditService
          .refund(userId, credits, { reason: '生图失败退回积分', relatedType: 'job', relatedId: jobId })
          .catch((e) => logCreditError('refund', jobId, e))
      }
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
    const credits = Number(creditsFrozen) || 1

    try {
      await prisma.generationJob.update({
        where: { id: jobId },
        data: { status: 'processing', startedAt: new Date(), jobType: 'composition' },
      })

      const envAsset = await prisma.asset.findUnique({ where: { id: environmentAssetId } })
      const designAsset = await prisma.asset.findUnique({ where: { id: designAssetId } })
      if (!envAsset || !designAsset) throw new Error('环境图或设计图不存在')

      const envPath = path.join(getStorageDir(), envAsset.storageKey)
      const designPath = path.join(getStorageDir(), designAsset.storageKey)

      const result = await compositionService.composeToEnvironment(
        {
          environmentImagePath: envPath,
          designImagePath: designPath,
          position,
          outputFormat: outputFormat === 'jpeg' ? 'jpeg' : 'png',
        },
        { userId, projectId },
      )

      await prisma.generationJob.update({
        where: { id: jobId },
        data: {
          status: 'succeeded',
          finishedAt: new Date(),
          responseJson: { assetId: result.assetId, url: result.url },
          creditsConsumed: credits,
        },
      })
      await creditService
        .consume(userId, credits, { reason: '环境合成完成', relatedType: 'job', relatedId: jobId })
        .catch((e) => logCreditError('consume', jobId, e))

      return { status: 'succeeded', assetId: result.assetId, url: result.url }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await prisma.generationJob
        .update({ where: { id: jobId }, data: { status: 'failed', finishedAt: new Date(), errorMessage: msg } })
        .catch((e) =>
          console.error(`[worker][db] 更新任务 ${jobId} 为 failed 失败:`, e instanceof Error ? e.message : e),
        )
      if (credits > 0) {
        await creditService
          .refund(userId, credits, { reason: '环境合成失败退回积分', relatedType: 'job', relatedId: jobId })
          .catch((e) => logCreditError('refund', jobId, e))
      }
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

export { imageWorker, compositionWorker }
