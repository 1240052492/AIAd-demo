import { Request, Response, NextFunction, RequestHandler } from 'express'
import { redisConnection } from '../config'

interface RateLimitOptions {
  /** 时间窗口（毫秒），默认 60s */
  windowMs?: number
  /** 窗口内允许的最大请求数，默认 60 */
  max?: number
  /** 限流维度，默认按 req.ip */
  key?: (req: Request) => string
  /** 超限提示文案 */
  message?: string
  /**
   * Redis key 前缀（桶名）。同一进程内多个限流器必须使用不同 bucket，
   * 否则会在 Redis 中互相串桶。默认 'default'。
   */
  bucket?: string
}

/**
 * 内存固定窗口限流（仅作为 Redis 不可用时的降级兜底）。
 * - 每个 key 存储窗口内的请求时间戳数组，定时清理过期桶避免内存泄漏。
 * - unref 定时任务，避免阻止进程退出。
 * - 注意：进程内内存，无法跨副本共享，多实例部署时保护会被稀释——因此仅作降级用。
 */
function createMemoryLimiter(windowMs: number, max: number) {
  const hits = new Map<string, number[]>()

  const cleanup = setInterval(() => {
    const now = Date.now()
    for (const [k, arr] of hits) {
      const recent = arr.filter((t) => now - t < windowMs)
      if (recent.length === 0) hits.delete(k)
      else hits.set(k, recent)
    }
  }, Math.max(windowMs, 60 * 1000))
  if (typeof cleanup.unref === 'function') cleanup.unref()

  /** 返回本次请求后的命中数（已含本次） */
  return (key: string): number => {
    const now = Date.now()
    const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
    arr.push(now)
    hits.set(key, arr)
    return arr.length
  }
}

/**
 * Redis 固定窗口限流器工厂（跨副本共享，多实例部署下真实生效）。
 *
 * 计数用 Redis 原子 `INCR` + 首次命中时 `PEXPIRE` 设置窗口过期：
 *   - key 形如 `ratelimit:{bucket}:{维度}:{窗口序号}`，窗口序号 = floor(now/windowMs)，
 *     天然滚动，无需手动清理；过期由 Redis 负责。
 *   - 首个请求（count===1）才设置 PEXPIRE，避免每次刷新过期时间导致窗口无限延长。
 *
 * 降级策略：Redis 报错时回退到进程内存限流（fail-safe，仍保留基础防护而非直接放行），
 * 保证 Redis 抖动/宕机不会连带打挂业务接口。
 */
export function rateLimit(opts: RateLimitOptions = {}): RequestHandler {
  const windowMs = opts.windowMs ?? 60 * 1000
  const max = opts.max ?? 60
  const keyFn = opts.key ?? ((req: Request) => req.ip ?? 'unknown')
  const message = opts.message ?? '请求过于频繁，请稍后再试'
  const bucket = opts.bucket ?? 'default'

  // 降级兜底：Redis 不可用时使用的进程内内存限流
  const memoryHit = createMemoryLimiter(windowMs, max)

  async function countHit(dimension: string): Promise<number> {
    const windowId = Math.floor(Date.now() / windowMs)
    const redisKey = `ratelimit:${bucket}:${dimension}:${windowId}`
    try {
      const count = await redisConnection.incr(redisKey)
      // 首次命中该窗口 key 时设置过期（+1s 冗余，确保窗口内 key 一定存活）
      if (count === 1) {
        await redisConnection.pexpire(redisKey, windowMs + 1000)
      }
      return count
    } catch {
      // Redis 不可用：降级到内存限流，保证接口不受连带影响
      return memoryHit(dimension)
    }
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const dimension = keyFn(req)
    const now = Date.now()
    countHit(dimension)
      .then((count) => {
        const remaining = Math.max(0, max - count)
        // 透传限流元信息，便于客户端自适应退避（F8）
        res.setHeader('X-RateLimit-Limit', String(max))
        res.setHeader('X-RateLimit-Remaining', String(remaining))
        res.setHeader('X-RateLimit-Reset', String(Math.ceil((now + windowMs) / 1000)))
        if (count > max) {
          res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)))
          res.status(429).json({ code: 429, message, data: null })
          return
        }
        next()
      })
      .catch(() => {
        // 计数逻辑本身不应抛错（已内置降级），但兜底放行，避免限流器成为单点故障
        next()
      })
  }
}

/** 登录接口：15 分钟内最多 10 次（防爆破） */
export const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, bucket: 'login' })

/**
 * 通用 API：60 秒内最多 300 次。
 * 原 60 次过于严格——SPA 的作业状态轮询（~30/min）+ 概况刷新 + 页面跳转，
 * 叠加 Vite 代理流量极易在 60s 窗口内超限，导致正常用户被 429 中断。
 * 300/min（≈5 req/s）对单 IP 仍构成滥用防护；爆破类攻击由 loginLimiter 单独兜底。
 */
export const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 300, bucket: 'api' })
