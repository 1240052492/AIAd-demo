import { redisConnection } from '../config'
import { creditService } from '../services/credit.service'

/**
 * 补偿型积分操作描述。
 * 当生图 / 合成任务的「扣减(consume)」或「退回(refund)」因瞬时故障失败时，
 * 不直接丢弃（否则会造成账户余额与任务状态不一致 / 用户积分被错误占用），
 * 而是走「有界重试 → 死信队列(DLQ)」补偿链路，保证最终可被对账修复。
 */
export interface CreditCompensationOp {
  type: 'consume' | 'refund'
  userId: string
  credits: number
  reason: string
  relatedType?: string
  relatedId?: string
  /** 内部使用：进入 DLQ 后重试次数，避免无限循环 */
  dlqAttempts?: number
}

/** Redis 死信列表 key */
const DLQ_KEY = 'credit:dlq'
/** 有界重试次数（consume/refund 本体的即时重试，不含 DLQ 重放） */
const MAX_RETRIES = 3
/** DLQ 重放时最多再试的次数，超过则丢弃（避免循环占用） */
const DLQ_MAX_ATTEMPTS = 5
/** DLQ 单条最大字节，超长则截断 reason，避免撑爆 Redis */
const DLQ_MAX_BYTES = 4096

/** Redis 不可用时的内存降级死信队列（进程级，重启即丢，仅兜底留痕） */
const inMemoryDlq: CreditCompensationOp[] = []
let redisUnavailable = false

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function logCreditOp(action: string, op: CreditCompensationOp, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err)
  console.error(
    `[credit-comp] ${action} 失败 userId=${op.userId} type=${op.type} credits=${op.credits}: ${msg}`,
  )
}

/**
 * 真正执行一次积分补偿操作（consume / refund）。
 */
async function executeCreditOp(op: CreditCompensationOp): Promise<void> {
  const ctx = { reason: op.reason, relatedType: op.relatedType, relatedId: op.relatedId }
  if (op.type === 'consume') {
    await creditService.consume(op.userId, op.credits, ctx)
  } else {
    await creditService.refund(op.userId, op.credits, ctx)
  }
}

/**
 * 把操作压入死信队列：优先 Redis 列表 `credit:dlq`；Redis 挂则降级内存数组。
 * 返回是否成功入队（失败仅降级，不影响主流程）。
 */
async function pushToDlq(op: CreditCompensationOp): Promise<void> {
  if (redisUnavailable) {
    inMemoryDlq.push(op)
    return
  }
  try {
    const sanitized: CreditCompensationOp = {
      ...op,
      reason: (op.reason || '').slice(0, 256),
    }
    let raw = JSON.stringify(sanitized)
    if (Buffer.byteLength(raw, 'utf8') > DLQ_MAX_BYTES) {
      sanitized.reason = '[truncated]'
      raw = JSON.stringify(sanitized)
    }
    await redisConnection.rpush(DLQ_KEY, raw)
  } catch (err) {
    // Redis 不可用 → 标记并降级内存
    redisUnavailable = true
    inMemoryDlq.push(op)
    console.error(
      `[credit-comp][dlq] Redis 不可用，降级内存死信队列: ${err instanceof Error ? err.message : err}`,
    )
  }
}

/**
 * 提交一次积分补偿：先本体重试 3 次（指数退避），仍失败则压入死信队列。
 *
 * 设计为「不抛错」——主流程的任务状态已落库，不应因补偿失败而中断或再次抛错。
 * 关键在于失败不再被静默吞掉，而是留痕到 DLQ，等待 processCreditDlq 重放。
 */
export async function enqueueCreditCompensation(op: CreditCompensationOp): Promise<void> {
  let lastErr: unknown
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await executeCreditOp(op)
      return
    } catch (err) {
      lastErr = err
      logCreditOp(`retry ${attempt + 1}/${MAX_RETRIES}`, op, err)
      if (attempt < MAX_RETRIES - 1) {
        // 指数退避：1s, 2s
        await sleep(Math.min(1000 * 2 ** attempt, 8000))
      }
    }
  }
  await pushToDlq(op)
  console.error(
    `[credit-comp][dlq] ${op.type} 本体重试耗尽，已入死信队列 userId=${op.userId} job=${
      op.relatedId || '-'
    }`,
  )
}

/**
 * 重放死信队列（best-effort）。
 * 先清空内存降级队列，再逐个 lpop Redis `credit:dlq` 重新执行。
 * 重放失败超过 DLQ_MAX_ATTEMPTS 次则丢弃该条（避免无限循环）。
 * @returns 成功补偿的条数
 */
export async function processCreditDlq(): Promise<number> {
  let processed = 0

  // 1) 内存降级队列
  while (inMemoryDlq.length > 0) {
    const op = inMemoryDlq.shift()!
    try {
      await executeCreditOp(op)
      processed++
    } catch (err) {
      logCreditOp('dlq-memory', op, err)
      const attempts = (op.dlqAttempts ?? 0) + 1
      if (attempts < DLQ_MAX_ATTEMPTS) {
        inMemoryDlq.push({ ...op, dlqAttempts: attempts })
      }
    }
  }

  // 2) Redis 死信队列
  if (redisUnavailable) return processed
  try {
    while (true) {
      let raw: string | null
      try {
        raw = await redisConnection.lpop(DLQ_KEY)
      } catch (err) {
        console.error(`[credit-comp][dlq] 读取 Redis 死信队列失败: ${err instanceof Error ? err.message : err}`)
        redisUnavailable = true
        break
      }
      if (!raw) break

      let op: CreditCompensationOp
      try {
        op = JSON.parse(raw) as CreditCompensationOp
      } catch {
        console.error('[credit-comp][dlq] 死信条目解析失败，丢弃')
        continue
      }

      try {
        await executeCreditOp(op)
        processed++
      } catch (err) {
        logCreditOp('dlq-redis', op, err)
        const attempts = (op.dlqAttempts ?? 0) + 1
        if (attempts < DLQ_MAX_ATTEMPTS) {
          await pushToDlq({ ...op, dlqAttempts: attempts })
        }
      }
    }
  } catch (err) {
    console.error(`[credit-comp][dlq] 处理死信队列异常: ${err instanceof Error ? err.message : err}`)
  }

  return processed
}
