import { Request, Response, NextFunction, RequestHandler } from 'express'

interface RateLimitOptions {
  /** 时间窗口（毫秒），默认 60s */
  windowMs?: number
  /** 窗口内允许的最大请求数，默认 60 */
  max?: number
  /** 限流维度，默认按 req.ip */
  key?: (req: Request) => string
  /** 超限提示文案 */
  message?: string
}

/**
 * 零依赖的内存固定窗口限流器工厂。
 * - 每个 key 存储窗口内的请求时间戳数组，定时清理过期桶避免内存泄漏。
 * - unref 定时任务，避免阻止进程退出。
 */
export function rateLimit(opts: RateLimitOptions = {}): RequestHandler {
  const windowMs = opts.windowMs ?? 60 * 1000
  const max = opts.max ?? 60
  const keyFn = opts.key ?? ((req: Request) => req.ip ?? 'unknown')
  const message = opts.message ?? '请求过于频繁，请稍后再试'

  const hits = new Map<string, number[]>()

  // 定时清理：移除窗口已过期的空桶，避免内存泄漏
  const cleanup = setInterval(() => {
    const now = Date.now()
    for (const [k, arr] of hits) {
      const recent = arr.filter((t) => now - t < windowMs)
      if (recent.length === 0) hits.delete(k)
      else hits.set(k, recent)
    }
  }, Math.max(windowMs, 60 * 1000))
  if (typeof cleanup.unref === 'function') cleanup.unref()

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now()
    const k = keyFn(req)
    const arr = (hits.get(k) ?? []).filter((t) => now - t < windowMs)
    arr.push(now)
    hits.set(k, arr)
    if (arr.length > max) {
      res.status(429).json({ code: 429, message, data: null })
      return
    }
    next()
  }
}

/** 登录接口：15 分钟内最多 10 次（防爆破） */
export const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 })

/** 通用 API：60 秒内最多 60 次 */
export const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 60 })
