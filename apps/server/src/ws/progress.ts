import { Server, IncomingMessage } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { EventEmitter } from 'events'
import jwt from 'jsonwebtoken'
import { env, prisma } from '../config'
import { isBlacklisted } from '../utils/token-blacklist'

/**
 * 实时进度 WebSocket 服务。
 *
 * 契约：
 *  - 挂载路径：`/ws`
 *  - 订阅方式：连接时通过 query `?jobId=<jobId>` 指定要接收的任务；
 *    不传则视为「全部任务」的广播订阅（MVP）。
 *  - 客户端收到的消息结构：
 *      { "type": "progress", "jobId": string, "stage": string,
 *        "percent": number, "message"?: string }
 *    连接建立时还会先收到一条：
 *      { "type": "connected", "jobId": string | null }
 *
 * 事件源：Agent F 在 `workers/progress.ts` 导出无副作用的 `jobProgressEmitter`
 * （EventEmitter），并 emit `'progress'` 事件，payload 为
 * `{ jobId, stage, percent, message? }`。
 *
 * 注意：从 `../workers/progress` 导入（而非 `../workers/image.worker`），
 * 以避免把 worker 模块的顶层副作用（创建 BullMQ Worker）带入 server 进程。
 */
import { jobProgressEmitter } from '../workers/progress'

/** 进度事件 payload（与 worker 约定一致） */
export interface ProgressPayload {
  jobId?: string
  stage?: string
  percent?: number
  message?: string
}

/** 单个订阅者的状态 */
interface Subscription {
  jobId: string
}

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined
  const prefix = `${name}=`
  const value = header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
  return value ? decodeURIComponent(value.slice(prefix.length)) : undefined
}

function rejectConnection(ws: WebSocket, message: string): void {
  try {
    ws.send(JSON.stringify({ type: 'error', message }))
  } finally {
    ws.close()
  }
}

export function setupProgressWs(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || '', 'http://localhost')
    const jobId = url.searchParams.get('jobId')?.trim()
    const accessCredential = url.searchParams.get('token') || readCookie(req.headers.cookie, 'access_token')
    const refreshCredential = readCookie(req.headers.cookie, 'refresh_token')
    const token = accessCredential || refreshCredential
    if (!jobId || !token) return rejectConnection(ws, '缺少任务或身份凭证')

    let userId: string | undefined
    try {
      const payload = jwt.verify(token, accessCredential ? env.jwtSecret : env.refreshTokenSecret) as Record<string, unknown>
      userId = (payload.userId || payload.sub || payload.id) as string | undefined
      const jti = payload.jti as string | undefined
      if (!userId || (jti && (await isBlacklisted(jti)))) {
        return rejectConnection(ws, '身份凭证已失效')
      }
    } catch {
      return rejectConnection(ws, '身份凭证已失效')
    }

    const [user, job] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { status: true } }),
      prisma.generationJob.findFirst({ where: { id: jobId, userId }, select: { id: true } }),
    ])
    if (!user || user.status !== 'active' || !job) {
      return rejectConnection(ws, '任务不存在或无权订阅')
    }

    const sub: Subscription = { jobId }

    const handler = (p: ProgressPayload) => {
      if (!p || typeof p !== 'object') return
      if (!p.jobId) return
      // 若客户端订阅了特定 jobId，只转发匹配的任务
      if (p.jobId !== sub.jobId) return
      try {
        ws.send(JSON.stringify({ type: 'progress', ...p }))
      } catch {
        // 连接已关闭，忽略写入错误
      }
    }

    if (jobProgressEmitter) {
      jobProgressEmitter.on('progress', handler)
      const cleanup = () => jobProgressEmitter?.off('progress', handler)
      ws.on('close', cleanup)
      ws.on('error', cleanup)
    } else {
      // Agent F 的 emitter 尚未就绪：保持连接可用，但暂不转发进度。
      console.warn(
        '[ws/progress] 未从 worker 模块取到 jobProgressEmitter，进度转发已禁用（等待 Agent F 接入）。',
      )
    }

    // 连接建立确认
    try {
      ws.send(JSON.stringify({ type: 'connected', jobId: sub.jobId || null }))
    } catch {
      /* 连接已关闭，忽略 */
    }
  })

  wss.on('listening', () => {
    console.log('[ws/progress] 实时进度 WebSocket 已挂载于 /ws')
  })
}
