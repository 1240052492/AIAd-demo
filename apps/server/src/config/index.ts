import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

// 单体仓库：优先加载仓库根目录的 .env（单一配置源），再加载应用级 .env（可用于覆盖）。
// 这样无论从仓库根还是 apps/server 启动，都能正确读到根目录的 .env。
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../../..', '.env') })
dotenv.config()

import { PrismaClient } from '@prisma/client'
import { Queue, Worker } from 'bullmq'
import IORedis from 'ioredis'

export const prisma = new PrismaClient()

// Redis 连接（用于 BullMQ）
// lazyConnect: 不在启动时立即建连，避免无 Redis 环境（如仅跑接口/离线开发）启动时刷屏报错；
// 真正用到队列时再按需连接。maxRetriesPerRequest: null 让 BullMQ 自行管理重试。
export const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
  lazyConnect: true,
})

// BullMQ 队列
export const imageQueue = new Queue('image-generation', {
  connection: redisConnection as any,
})
export const compositionQueue = new Queue('composition', {
  connection: redisConnection as any,
})

// 环境变量便捷访问
export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4177', 10),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  registerBonusCredits: parseInt(process.env.REGISTER_BONUS_CREDITS || '5', 10),

  // AI Providers
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',

  openaiImageApiKey: process.env.OPENAI_IMAGE_API_KEY || '',
  openaiImageBaseUrl: process.env.OPENAI_IMAGE_BASE_URL || '',
  openaiImageModel: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
  // 生图模式：async（异步提交 + 轮询，默认）/ sync（同步直请求）/ auto（异步优先，404/405 时回退同步）
  openaiImageMode: (process.env.OPENAI_IMAGE_MODE || 'async') as 'async' | 'sync' | 'auto',

  // Storage
  storageDriver: process.env.STORAGE_DRIVER || 'local',
  localStorageDir: process.env.LOCAL_STORAGE_DIR || 'storage/uploads',
}

// 安全告警：生产环境严禁使用默认 JWT 密钥，否则任何人可伪造令牌越权访问
if (env.nodeEnv === 'production' && env.jwtSecret === 'dev-secret-change-me') {
  console.warn(
    '[security] 生产环境正在使用默认 JWT_SECRET，存在严重越权风险！请通过环境变量 JWT_SECRET 设置强随机密钥后再上线。',
  )
}
