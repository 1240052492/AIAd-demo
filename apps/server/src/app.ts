import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import compression from 'compression'
import dotenv from 'dotenv'
import { authRoutes } from './routes/auth'
import { projectRoutes } from './routes/projects'
import { aiRoutes } from './routes/ai'
import { imageJobRoutes } from './routes/image-jobs'
import { compositionJobRoutes } from './routes/composition-jobs'
import { vectorAssetRoutes } from './routes/vector-assets'
import { creditRoutes } from './routes/credits'
import { adminRoutes } from './routes/admin'
import { membershipRoutes } from './routes/membership'
import { dashboardRoutes } from './routes/dashboard'
import { templateRoutes } from './routes/templates'
import { AppError } from './utils/errors'
import { prisma, redisConnection, env } from './config'
import { loginLimiter, apiLimiter } from './middleware/rate-limit'
import { getProviderCapabilities } from './services/capability.service'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()

// 反代（nginx 等）之后让 req.ip 反映真实客户端 IP
app.set('trust proxy', process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : 1)

const PORT = process.env.PORT || 4177

// 中间件
app.use(helmet({ contentSecurityPolicy: false })) // 允许本地图片加载
app.use(
  cors({
    // 多 origin 支持：根据请求头 origin 动态反射匹配的源；无 origin（同源/移动端/CLI）放行
    origin: (origin, callback) => {
      if (!origin) return callback(null, true)
      if (env.corsOrigins.includes(origin)) return callback(null, true)
      return callback(null, false)
    },
    // credentials 仅能为布尔值（cors 类型约束）。此处保持 true：跨域白名单源需要携带 Cookie。
    // 说明（F13）：无 Origin 的同源/服务端请求会被 cors 反射为 `Access-Control-Allow-Origin: *`，
    // 非浏览器客户端本就不受 CORS 限制，属于可接受的权衡；如未来引入网关层，建议在网关统一收敛。
    credentials: true,
  }),
)
app.use(morgan('dev'))
app.use(compression())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// 静态文件（上传的图片）。关闭目录索引，避免生产环境通过 /storage/ 枚举上传文件
app.use(
  '/storage',
  express.static(process.env.LOCAL_STORAGE_DIR || 'storage/uploads', {
    index: false,
    dotfiles: 'ignore',
  }),
)

// 前端产物（apps/web/dist）静态托管 + SPA fallback。
// 用 fs.existsSync 守卫：开发环境无 dist 时不影响接口服务。
const webDist = path.resolve(__dirname, '../../web/dist')
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist))
}

// 健康检查：同时探活 DB 与 Redis，绝不抛错
app.get('/api/health', async (_req, res) => {
  let db = false
  let redis = false
  try {
    await prisma.$queryRaw`SELECT 1`
    db = true
  } catch {
    db = false
  }
  try {
    await redisConnection.ping()
    redis = true
  } catch {
    redis = false
  }
  if (db && redis) {
    res.status(200).json({ status: 'ok', db: true, redis: true })
  } else {
    res.status(503).json({ status: 'degraded', db, redis })
  }
})

// 仅暴露布尔能力，不返回密钥、地址或模型配置。前端据此禁用不可执行的真实生成入口。
app.get('/api/capabilities', async (_req, res, next) => {
  try {
    res.json({ code: 0, message: 'ok', data: await getProviderCapabilities() })
  } catch (err) {
    next(err)
  }
})

// 限流器：登录接口严格，AI / 图片任务接口宽松（需在对应路由挂载之前）
app.use('/api/auth/login', loginLimiter)
app.use('/api/ai', apiLimiter)
app.use('/api/image-jobs', apiLimiter)
app.use('/api/composition-jobs', apiLimiter)
app.use('/api/vector-assets', apiLimiter)

// 路由
app.use('/api/auth', authRoutes)
app.use('/api/projects', projectRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/image-jobs', imageJobRoutes)
app.use('/api/composition-jobs', compositionJobRoutes)
app.use('/api/membership', membershipRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/vector-assets', vectorAssetRoutes)
app.use('/api/credits', creditRoutes)
app.use('/api/templates', templateRoutes)
app.use('/api/admin', adminRoutes)

// SPA fallback：非 /api 路径返回 index.html（仅在存在前端产物时启用）
if (fs.existsSync(webDist)) {
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(webDist, 'index.html'))
  })
}

// 错误处理（统一响应格式）
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const isDev = process.env.NODE_ENV === 'development'
  if (err instanceof AppError) {
    console.error(`[${err.name}]`, err.message)
    res.status(err.status).json({ code: err.code, message: err.message, data: null })
    return
  }
  console.error('[Server Error]', err)
  res.status(500).json({
    code: 500,
    message: isDev ? err.message : '服务器内部错误',
    data: null,
  })
})

export default app
