import { prisma } from '../config'

/**
 * 积分操作结果
 */
export interface CreditResult {
  accountId: string
  balance: number
  frozenBalance: number
}

/**
 * 积分操作可选上下文
 */
export interface CreditContext {
  reason?: string
  relatedType?: string
  relatedId?: string
}

/**
 * 积分服务
 *
 * 所有积分变动都必须经过本服务，禁止在业务代码里直接修改 creditAccount 表。
 * 设计约定：
 * - freeze（冻结）：可用余额 -> 冻结余额，用于「先占后扣」的异步任务场景。
 * - consume（扣减）：冻结余额 -> 已消费，配合 freeze 使用。
 * - refund（退回）：冻结余额 -> 可用余额，用于任务失败或取消时的释放。
 * 每一次变动都会写入 credit_transactions 流水，便于对账。
 */
export class CreditService {
  /**
   * 冻结积分：把可用余额划转到冻结余额。
   * @param userId 用户 ID
   * @param amount 冻结数量（必须 > 0）
   * @param ctx 流水上下文（原因 / 关联对象）
   * @throws 当账户不存在或可用余额不足时抛出中文错误
   */
  async freeze(userId: string, amount: number, ctx?: CreditContext): Promise<CreditResult> {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error('冻结积分数量必须为正整数')
    }
    return prisma.$transaction(async (tx) => {
      const account = await tx.creditAccount.findUnique({ where: { userId } })
      if (!account) throw new Error('未找到积分账户')
      if (account.balance < amount) {
        throw new Error(`可用积分不足，当前可用 ${account.balance}，需要 ${amount}`)
      }
      const updated = await tx.creditAccount.update({
        where: { id: account.id },
        data: { balance: { decrement: amount }, frozenBalance: { increment: amount } },
      })
      await tx.creditTransaction.create({
        data: {
          userId,
          accountId: account.id,
          type: 'freeze',
          amount: -amount,
          balanceAfter: updated.balance,
          reason: ctx?.reason ?? '冻结积分',
          relatedType: ctx?.relatedType,
          relatedId: ctx?.relatedId,
        },
      })
      return { accountId: updated.id, balance: updated.balance, frozenBalance: updated.frozenBalance }
    })
  }

  /**
   * 扣减积分：从冻结余额中消耗（任务成功时调用）。
   * @param userId 用户 ID
   * @param amount 扣减数量（必须 > 0）
   * @param ctx 流水上下文
   * @throws 当冻结余额不足时抛出中文错误
   */
  async consume(userId: string, amount: number, ctx?: CreditContext): Promise<CreditResult> {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error('扣减积分数量必须为正整数')
    }
    return prisma.$transaction(async (tx) => {
      const account = await tx.creditAccount.findUnique({ where: { userId } })
      if (!account) throw new Error('未找到积分账户')
      if (account.frozenBalance < amount) {
        throw new Error(`冻结积分不足，无法扣减（冻结 ${account.frozenBalance}，需扣 ${amount}）`)
      }
      const updated = await tx.creditAccount.update({
        where: { id: account.id },
        data: { frozenBalance: { decrement: amount } },
      })
      await tx.creditTransaction.create({
        data: {
          userId,
          accountId: account.id,
          type: 'consume',
          amount: -amount,
          balanceAfter: updated.balance,
          reason: ctx?.reason ?? '消耗积分',
          relatedType: ctx?.relatedType,
          relatedId: ctx?.relatedId,
        },
      })
      return { accountId: updated.id, balance: updated.balance, frozenBalance: updated.frozenBalance }
    })
  }

  /**
   * 退回积分：把冻结余额还回可用余额（任务失败 / 取消时调用）。
   * @param userId 用户 ID
   * @param amount 退回数量（必须 > 0）
   * @param ctx 流水上下文
   */
  async refund(userId: string, amount: number, ctx?: CreditContext): Promise<CreditResult> {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error('退回积分数量必须为正整数')
    }
    return prisma.$transaction(async (tx) => {
      const account = await tx.creditAccount.findUnique({ where: { userId } })
      if (!account) throw new Error('未找到积分账户')
      const refundAmount = Math.min(amount, account.frozenBalance)
      if (refundAmount <= 0) {
        return { accountId: account.id, balance: account.balance, frozenBalance: account.frozenBalance }
      }
      const updated = await tx.creditAccount.update({
        where: { id: account.id },
        data: { frozenBalance: { decrement: refundAmount }, balance: { increment: refundAmount } },
      })
      await tx.creditTransaction.create({
        data: {
          userId,
          accountId: account.id,
          type: 'refund',
          amount: refundAmount,
          balanceAfter: updated.balance,
          reason: ctx?.reason ?? '退回积分',
          relatedType: ctx?.relatedType,
          relatedId: ctx?.relatedId,
        },
      })
      return { accountId: updated.id, balance: updated.balance, frozenBalance: updated.frozenBalance }
    })
  }

  /**
   * 查询用户积分账户（可用 + 冻结余额）。
   */
  async getBalance(userId: string): Promise<{ balance: number; frozenBalance: number }> {
    const account = await prisma.creditAccount.findUnique({ where: { userId } })
    if (!account) return { balance: 0, frozenBalance: 0 }
    return { balance: account.balance, frozenBalance: account.frozenBalance }
  }

  /**
   * 查询用户积分账户（与 getBalance 别名，语义化给路由层使用）。
   */
  async getAccount(userId: string): Promise<{ balance: number; frozenBalance: number }> {
    return this.getBalance(userId)
  }

  /**
   * 分页查询用户积分流水。
   * @returns { items, total, page, pageSize }
   */
  async getTransactions(
    userId: string,
    opts: { page?: number; pageSize?: number } = {},
  ): Promise<{ items: unknown[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(1, opts.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20))
    const where = { userId }
    const [items, total] = await prisma.$transaction([
      prisma.creditTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.creditTransaction.count({ where }),
    ])
    return { items, total, page, pageSize }
  }

  /**
   * 确保用户积分账户存在（不存在则创建空账户）。
   */
  async ensureAccount(userId: string) {
    return prisma.creditAccount.upsert({
      where: { userId },
      create: { userId, balance: 0, frozenBalance: 0 },
      update: {},
    })
  }
}

export const creditService = new CreditService()
