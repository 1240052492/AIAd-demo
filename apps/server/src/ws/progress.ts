import { Server, IncomingMessage } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { EventEmitter } from 'events'

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
  jobId?: string
}

export function setupProgressWs(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || '', 'http://localhost')
    const sub: Subscription = {
      jobId: url.searchParams.get('jobId') || undefined,
    }

    // —— 鉴权最小化（MVP） ——
    // 接受 ?token= 或 Cookie 中的凭据；缺失也允许连接（仅订阅，不做强鉴权）。
    // 生产环境应在下方 TODO 处校验 token / 会话，并将订阅的 jobId 与当前用户
    // 的归属关系做绑定，避免未授权订阅任意 jobId 的进度。
    const token = url.searchParams.get('token') || undefined
    if (token) {
      // TODO(security): 校验 token，绑定 userId 与 jobId 的归属关系。
    }

    const handler = (p: ProgressPayload) => {
      if (!p || typeof p !== 'object') return
      if (!p.jobId) return
      // 若客户端订阅了特定 jobId，只转发匹配的任务
      if (sub.jobId && p.jobId !== sub.jobId) return
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
