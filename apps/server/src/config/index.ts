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

// ===== 环境变量便捷访问 =====
const nodeEnv = process.env.NODE_ENV || 'development'
const appUrl = process.env.APP_URL || 'http://localhost:5173'

// JWT 访问令牌密钥
const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-me'

// 安全加固（fail-fast）：生产环境严禁使用默认 / 空的 JWT 密钥，
// 否则任何人都能伪造令牌越权访问。此时直接快速失败退出，避免带致命漏洞上线。
// 开发环境保持原行为（不退出）。
if (nodeEnv === 'production' && (!jwtSecret || jwtSecret === 'dev-secret-change-me')) {
  console.error(
    '[security] 生产环境检测到默认或空的 JWT_SECRET，存在严重越权风险！' +
      '请通过环境变量 JWT_SECRET 设置强随机密钥后再启动。进程已退出（exit 1）。',
  )
  process.exit(1)
}

// 刷新令牌密钥：生产环境应显式设置 JWT_REFRESH_SECRET，避免与访问令牌共用同一密钥。
// 未设置时回退为访问密钥 + 后缀（仅用于开发/兼容，生产请显式配置）。
const refreshTokenSecret = process.env.JWT_REFRESH_SECRET || `${jwtSecret}-refresh`

// 生产守卫：未显式设置独立的 JWT_REFRESH_SECRET 时给出告警。
// 回退值由强随机的 JWT_SECRET 派生，安全性尚可，但显式独立密钥可在轮换访问密钥时
// 不影响 refresh 令牌，反之亦然，运维更清晰。
if (nodeEnv === 'production' && !process.env.JWT_REFRESH_SECRET) {
  console.warn(
    '[security] 生产环境未显式设置 JWT_REFRESH_SECRET，当前回退为 JWT_SECRET 派生值。' +
      '建议在 .env 中单独配置一个不同的强随机串。',
  )
}

// CORS 允许的 origin 列表（支持多 origin，逗号分隔；为空时回退到 APP_URL 或 localhost）。
const corsOrigins = (process.env.CORS_ORIGINS || appUrl)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

// 生产守卫：CORS 白名单必须显式配置为真实前端域名。
// 若未设置 CORS_ORIGINS 而回退到 localhost/127.0.0.1，说明是误配——生产环境
// 直接 fail-fast 退出，避免带着错误的跨域白名单上线（前端将全部被拒或安全策略失效）。
if (nodeEnv === 'production') {
  const hasLocalhost = corsOrigins.some((o) => /localhost|127\.0\.0\.1/i.test(o))
  if (!process.env.CORS_ORIGINS || hasLocalhost) {
    console.error(
      '[security] 生产环境的 CORS 白名单无效（未设置 CORS_ORIGINS 或仍指向 localhost）！' +
        '请通过环境变量 CORS_ORIGINS 设置真实前端域名（多个用逗号分隔）后再启动。进程已退出（exit 1）。',
    )
    process.exit(1)
  }
}

// DB 连接池：在给 PrismaClient 使用的 DATABASE_URL 上追加 connection_limit 查询参数。
// Prisma 直接读取 process.env.DATABASE_URL，这里覆盖它即可（向后兼容：未设置 DATABASE_URL 时不影响）。
const dbConnectionLimit = Number(process.env.DB_CONNECTION_LIMIT || 10)
const rawDatabaseUrl = process.env.DATABASE_URL || ''
if (rawDatabaseUrl) {
  const sep = rawDatabaseUrl.includes('?') ? '&' : '?'
  process.env.DATABASE_URL = `${rawDatabaseUrl}${sep}connection_limit=${dbConnectionLimit}`
}

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
  nodeEnv,
  appUrl,
  port: parseInt(process.env.PORT || '4177', 10),
  jwtSecret,
  refreshTokenSecret,
  corsOrigins,
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
  openaiImageSubmitTimeoutMs: Math.max(60_000, parseInt(process.env.OPENAI_IMAGE_SUBMIT_TIMEOUT_MS || '600000', 10)),

  // Storage
  storageDriver: process.env.STORAGE_DRIVER || 'local',
  localStorageDir: process.env.LOCAL_STORAGE_DIR || 'storage/uploads',

  // OCR / text correction
  ocrServiceUrl: process.env.OCR_SERVICE_URL || 'http://127.0.0.1:4188',
  ocrRequestTimeoutMs: parseInt(process.env.OCR_REQUEST_TIMEOUT_MS || '25000', 10),
  ocrMaxInputEdge: parseInt(process.env.OCR_MAX_INPUT_EDGE || '2048', 10),
  ocrMinConfidence: Number(process.env.OCR_MIN_CONFIDENCE || '0.7'),
  textRenderFontFamily:
    process.env.TEXT_RENDER_FONT_FAMILY || 'Microsoft YaHei, Noto Sans CJK SC, sans-serif',
  textRenderMaxInputPixels: parseInt(process.env.TEXT_RENDER_MAX_INPUT_PIXELS || '40000000', 10),
}

// 命名导出：便于其它 agent 直接 import（与 env 对象内容保持一致）
export { appUrl, jwtSecret, refreshTokenSecret, corsOrigins }

// 开发环境提示：生产环境已在上面 fail-fast，这里仅对开发环境的默认密钥给出友好提醒。
if (nodeEnv !== 'production' && jwtSecret === 'dev-secret-change-me') {
  console.warn(
    '[dev] 正在使用默认 JWT_SECRET（dev-secret-change-me），仅可用于本地开发，切勿用于任何生产/公网环境。',
  )
}
