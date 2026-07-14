import { prisma } from '../config'
import { creditService } from './credit.service'
import { roleConfigService } from './role-config.service'
import { NotFoundError, ValidationError } from '../utils/errors'

/**
 * 充值服务
 *
 * 链路：用户发起充值（金额，单位分）-> 计算到账积分（金额/100 * 比例 + 首充赠送）
 *      -> 创建 recharge_orders（pending）-> 支付回调确认（paid）-> 实际发放积分到 credit_accounts。
 *
 * 本环境无真实支付网关，confirmPayment 模拟支付成功并即时发放，便于真实数据测试。
 * 生产接入支付网关时，只需把 confirmPayment 挂到回调/webhook 即可。
 */
function genOrderNo(): string {
  return 'RC' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 8).toUpperCase()
}

export class RechargeService {
  /** 充值比例：1 元 = 10 积分（100 分 = 10 积分） */
  private get ratio(): number {
    return 10
  }
  /** 首充赠送积分 */
  private get firstRechargeBonus(): number {
    return 50
  }

  private async getUserRoleCodes(userId: string): Promise<string[]> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { roles: { select: { role: { select: { code: true } } } } },
    })
    return user?.roles.map((item) => item.role.code) ?? []
  }

  /** 创建充值订单（pending）。amount 记录折扣后的应付金额，points 按积分包原价计算。 */
  async createOrder(userId: string, listAmountCents: number, payChannel = 'manual') {
    if (!Number.isInteger(listAmountCents) || listAmountCents <= 0) {
      throw new ValidationError('充值金额必须为正整数（单位：分）')
    }
    if (listAmountCents > 100000000) throw new ValidationError('充值金额过大')
    const roleCodes = await this.getUserRoleCodes(userId)
    const rate = await roleConfigService.getEffectiveRate(roleCodes)
    const payableAmountCents = Math.max(1, Math.ceil(listAmountCents * rate))
    const basePoints = Math.floor((listAmountCents / 100) * this.ratio)
    const hadRecharge = await prisma.rechargeOrder.count({ where: { userId, status: 'paid' } })
    const bonus = hadRecharge === 0 ? this.firstRechargeBonus : 0
    const order = await prisma.rechargeOrder.create({
      data: {
        userId,
        orderNo: genOrderNo(),
        amount: payableAmountCents,
        points: basePoints + bonus,
        rate,
        payChannel,
        status: 'pending',
      },
    })
    return order
  }

  /** 模拟支付回调：标记已支付并实际发放积分（原子） */
  async confirmPayment(orderNo: string, operatorId?: string) {
    const order = await prisma.rechargeOrder.findUnique({ where: { orderNo } })
    if (!order) throw new NotFoundError('充值订单不存在')
    if (order.status === 'paid') return order
    const updated = await prisma.$transaction(async (tx) => {
      const o = await tx.rechargeOrder.update({
        where: { orderNo },
        data: { status: 'paid', paidAt: new Date() },
      })
      await creditService.recharge(o.userId, o.points, {
        reason: '账户充值',
        relatedType: 'recharge',
        relatedId: o.id,
        operatorId,
      })
      return o
    })
    return updated
  }

  /** 用户本人的充值记录（分页） */
  async listUserOrders(
    userId: string,
    opts: { page?: number; pageSize?: number } = {},
  ) {
    const page = Math.max(1, opts.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20))
    const where = { userId }
    const [items, total] = await prisma.$transaction([
      prisma.rechargeOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.rechargeOrder.count({ where }),
    ])
    return { items, total, page, pageSize }
  }

  /** 管理员：全部充值记录（分页 + 状态筛选） */
  async listAll(opts: { page?: number; pageSize?: number; status?: string } = {}) {
    const page = Math.max(1, opts.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20))
    const where: Record<string, unknown> = {}
    if (opts.status) where.status = opts.status
    const [items, total] = await prisma.$transaction([
      prisma.rechargeOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { nickname: true, email: true } } },
      }),
      prisma.rechargeOrder.count({ where }),
    ])
    return { items, total, page, pageSize }
  }
}

export const rechargeService = new RechargeService()
