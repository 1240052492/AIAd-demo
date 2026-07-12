import { createServer } from 'http'
import app from './app'
import { setupProgressWs } from './ws/progress'
import { prisma, redisConnection } from './config'

// 以 express app 为基础创建 HTTP 服务，并挂载实时进度 WebSocket。
const server = createServer(app)
setupProgressWs(server)

const port = Number(process.env.PORT) || 4177
server.listen(port, () => {
  console.log(`🚀 AdCraft AI Server (HTTP + WebSocket) running on http://127.0.0.1:${port}`)
  console.log(`   WebSocket 进度服务: ws://127.0.0.1:${port}/ws?jobId=<jobId>`)
})

// —— 优雅关闭 ——
// 先停 HTTP/WS 服务（不再接受新连接），再断开 DB / Redis 连接后退出。
let shuttingDown = false
async function gracefulShutdown(signal: string): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`\n[server] 收到 ${signal}，正在优雅关闭...`)

  server.close(() => {
    console.log('[server] HTTP/WS 服务已关闭')
  })

  try {
    await prisma.$disconnect()
  } catch (e) {
    console.error('[server] prisma 断开失败', e)
  }
  try {
    redisConnection.disconnect()
  } catch (e) {
    console.error('[server] redis 断开失败', e)
  }

  // 给已建立的连接一点时间完成响应后再退出。
  const forceExit = setTimeout(() => process.exit(0), 500)
  // 避免该定时器阻止进程自然退出
  if (typeof forceExit.unref === 'function') forceExit.unref()
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => void gracefulShutdown('SIGINT'))
