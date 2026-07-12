import { EventEmitter } from 'events'

/**
 * 任务进度事件发射器（共享单例）。
 *
 * Agent H 会 import 本对象，监听 'progress' 事件并经 WebSocket 广播给前端。
 * 本模块无副作用（不创建 Worker / 不连接外部依赖），可被任意模块安全 import。
 *
 * 事件名：'progress'
 * payload：{ jobId: string; stage: string; percent: number; message?: string }
 *   stage 取值：'submitted' | 'polling' | 'downloading' | 'saving' | 'done' | 'failed'
 *   percent：0-100 的整数（failed 时固定 100）
 */
export const jobProgressEmitter = new EventEmitter()

// 多 worker / 多订阅者场景下避免默认 10 监听器告警
jobProgressEmitter.setMaxListeners(100)

export interface JobProgressPayload {
  jobId: string
  stage: 'submitted' | 'polling' | 'downloading' | 'saving' | 'done' | 'failed'
  percent: number
  message?: string
}

/**
 * 轻量发布进度事件。任何异常都不应影响主流程，因此这里吞掉订阅者抛出的错误。
 */
export function emitJobProgress(payload: JobProgressPayload): void {
  try {
    jobProgressEmitter.emit('progress', payload)
  } catch (err) {
    console.error(
      `[progress] emit 失败 jobId=${payload.jobId} stage=${payload.stage}:`,
      err instanceof Error ? err.message : err,
    )
  }
}
