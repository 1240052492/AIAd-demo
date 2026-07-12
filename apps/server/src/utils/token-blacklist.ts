import { redisConnection } from '../config'

/**
 * 令牌黑名单（基于 jti）。
 *
 * 存储策略：优先写入 Redis（与 BullMQ 共用 redisConnection），并设置 EXPIRE = expSeconds；
 * 当 Redis 不可用（连接失败 / 超时）时，best-effort 降级为进程内内存 Map，保证鉴权链路不阻塞。
 *
 * 契约：addToBlacklist(jti, expSeconds)、isBlacklisted(jti)。
 */

const BLACKLIST_PREFIX = 'blklst:jti:'
// Redis 调用超时，超时即视为“不可用”并降级到内存，避免请求被挂起
const REDIS_TIMEOUT_MS = 1000

// 内存降级存储：jti -> 到期时间戳(ms)
const memoryStore = new Map<string, number>()

function memorySet(jti: string, expSeconds: number): void {
  const expireAt = Date.now() + expSeconds * 1000
  memoryStore.set(jti, expireAt)
  // 到点后惰性清理（unref 避免阻止进程退出）
  setTimeout(() => memoryStore.delete(jti), expSeconds * 1000).unref?.()
}

function memoryHas(jti: string): boolean {
  const expireAt = memoryStore.get(jti)
  if (expireAt === undefined) return false
  if (expireAt <= Date.now()) {
    memoryStore.delete(jti)
    return false
  }
  return true
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('redis timeout')), ms)),
  ])
}

/**
 * 将 jti 加入黑名单。
 * @param jti 令牌唯一标识
 * @param expSeconds 黑名单存活时间（通常为令牌剩余有效期，秒）
 */
export async function addToBlacklist(jti: string, expSeconds: number): Promise<void> {
  if (!jti || expSeconds <= 0) return
  try {
    await withTimeout(
      redisConnection.set(`${BLACKLIST_PREFIX}${jti}`, '1', 'EX', expSeconds),
      REDIS_TIMEOUT_MS,
    )
  } catch {
    // Redis 不可用：降级到内存（best-effort）
    memorySet(jti, expSeconds)
  }
}

/**
 * 判断 jti 是否已被拉黑。
 * Redis 不可用或未命中时回退内存存储；两者皆不可用时默认视为未拉黑（放行）。
 */
export async function isBlacklisted(jti: string): Promise<boolean> {
  if (!jti) return false
  try {
    const result = await withTimeout(redisConnection.get(`${BLACKLIST_PREFIX}${jti}`), REDIS_TIMEOUT_MS)
    return result !== null
  } catch {
    return memoryHas(jti)
  }
}
