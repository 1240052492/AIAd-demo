import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// monorepo 单一配置源：优先加载仓库根 .env，再叠加本地 .env（若存在）
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../..', '.env') })
dotenv.config()

import IORedis from 'ioredis'
import { Worker, Job } from 'bullmq'
import { PrismaClient } from '@prisma/client'

// Worker 是独立进程，自行初始化 Prisma 与 Redis 连接
const prisma = new PrismaClient()

const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
})

const QUEUE_NAME = {
  image: 'image-generation',
  composition: 'composition',
}

/** 根据 generationJobId 更新任务状态 */
async function updateJob(
  generationJobId: string,
  data: {
    status?: string
    errorMessage?: string | null
    responseJson?: unknown
    creditsConsumed?: number
    startedAt?: Date | null
    finishedAt?: Date | null
  },
) {
  try {
    await prisma.generationJob.update({
      where: { id: generationJobId },
      data: data as any,
    })
  } catch (err) {
    console.error('[Worker] 更新任务状态失败', generationJobId, err)
  }
}

/**
 * 实际调用 AI Provider 的扩展点。
 * 真实生成逻辑由对应的 Agent 在此处接入（Anthropic / OpenAI / banana2）。
 * 当前为占位实现：仅标记成功并返回占位响应，便于端到端联调。
 */
async function runProvider(job: Job): Promise<{ responseJson: unknown }> {
  const { provider, jobType, prompt } = job.data as any
  console.log(`[Worker] 处理 ${jobType} / provider=${provider} / prompt=${(prompt || '').slice(0, 40)}`)

  // TODO(Agent): 在此根据 provider / jobType 调用真实生图/合成服务
  // 例如：const result = await callOpenAIImage(job.data)

  // 占位：模拟处理耗时
  await new Promise((r) => setTimeout(r, 200))

  return {
    responseJson: {
      placeholder: true,
      provider,
      jobType,
      note: 'provider 适配未接入，返回占位结果',
    },
  }
}

async function processImageJob(job: Job) {
  const { generationJobId } = job.data as any
  await updateJob(generationJobId, { status: 'processing', startedAt: new Date() })
  try {
    const { responseJson } = await runProvider(job)
    await updateJob(generationJobId, {
      status: 'succeeded',
      responseJson,
      finishedAt: new Date(),
      creditsConsumed: 0,
    })
  } catch (err: any) {
    await updateJob(generationJobId, {
      status: 'failed',
      errorMessage: err?.message || '处理失败',
      finishedAt: new Date(),
    })
  }
}

async function processCompositionJob(job: Job) {
  const { generationJobId } = job.data as any
  await updateJob(generationJobId, { status: 'processing', startedAt: new Date() })
  try {
    const { responseJson } = await runProvider(job)
    await updateJob(generationJobId, {
      status: 'succeeded',
      responseJson,
      finishedAt: new Date(),
      creditsConsumed: 0,
    })
  } catch (err: any) {
    await updateJob(generationJobId, {
      status: 'failed',
      errorMessage: err?.message || '合成失败',
      finishedAt: new Date(),
    })
  }
}

const imageWorker = new Worker(QUEUE_NAME.image, processImageJob, { connection })
const compositionWorker = new Worker(QUEUE_NAME.composition, processCompositionJob, { connection })

imageWorker.on('completed', (job) => console.log(`[Worker] ✅ image job ${job.id} completed`))
imageWorker.on('failed', (job, err) => console.error(`[Worker] ❌ image job ${job?.id} failed:`, err?.message))
compositionWorker.on('completed', (job) => console.log(`[Worker] ✅ composition job ${job.id} completed`))
compositionWorker.on('failed', (job, err) => console.error(`[Worker] ❌ composition job ${job?.id} failed:`, err?.message))

console.log('🔄 AdCraft Worker started')

// 优雅关闭
async function shutdown(signal: string) {
  console.log(`\n[Worker] 收到 ${signal}，正在关闭...`)
  await imageWorker.close()
  await compositionWorker.close()
  await connection.quit()
  await prisma.$disconnect()
  process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
