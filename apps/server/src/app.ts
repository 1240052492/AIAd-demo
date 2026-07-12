import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import dotenv from 'dotenv'
import { authRoutes } from './routes/auth'
import { projectRoutes } from './routes/projects'
import { aiRoutes } from './routes/ai'
import { imageJobRoutes } from './routes/image-jobs'
import { creditRoutes } from './routes/credits'
import { adminRoutes } from './routes/admin'
import { templateRoutes } from './routes/templates'
import { AppError } from './utils/errors'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 4177

// 中间件
app.use(helmet({ contentSecurityPolicy: false })) // 允许本地图片加载
app.use(cors({ origin: process.env.APP_URL || 'http://127.0.0.1:5173', credentials: true }))
app.use(morgan('dev'))
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

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// 路由
app.use('/api/auth', authRoutes)
app.use('/api/projects', projectRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/image-jobs', imageJobRoutes)
app.use('/api/credits', creditRoutes)
app.use('/api/templates', templateRoutes)
app.use('/api/admin', adminRoutes)

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

app.listen(PORT, () => {
  console.log(`🚀 AdCraft AI Server running on http://127.0.0.1:${PORT}`)
})

export default app
