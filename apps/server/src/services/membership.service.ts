import { prisma } from '../config'
import { creditService } from './credit.service'
import { NotFoundError, ValidationError } from '../utils/errors'

/**
 * 会员套餐服务
 *
 * - 套餐（membership_plans）：月度/年度/企业会员/购买积分，含价格、赠送积分、消费倍率、权限包，均可在后台配置。
 * - 用户会员期（user_memberships）：购买后建立，含到期时间；过期自动不参与。
 * - 购买即发放积分（通过 creditService.recharge，保证积分流水一致）。
 */
export class MembershipService {
  /** 列出套餐（activeOnly=true 时仅返回启用项，供前端积分超市） */
  async listPlans(activeOnly = false) {
    const where = activeOnly ? { isActive: true } : {}
    return prisma.membershipPlan.findMany({ where, orderBy: { sortOrder: 'asc' } })
  }

  async getPlan(idOrCode: string) {
    return prisma.membershipPlan.findFirst({ where: { OR: [{ id: idOrCode }, { code: idOrCode }] } })
  }

  /** 新建或更新套餐（管理员） */
  async upsertPlan(data: {
    id?: string
    code: string
    name: string
    description?: string
    price?: number
    points?: number
    durationDays?: number | null
    rate?: number
    permissions?: unknown
    isActive?: boolean
    sortOrder?: number
  }) {
    const { id, code, ...rest } = data
    if (!code || !/^[a-z0-9_]+$/.test(code)) {
      throw new ValidationError('套餐编码非法（仅限小写字母、数字、下划线）')
    }
    if (rest.permissions !== undefined) {
      rest.permissions = this.normalizePermissions(rest.permissions)
    }
    if (id) {
      const existing = await prisma.membershipPlan.findUnique({ where: { id } })
      if (!existing) throw new NotFoundError('会员套餐不存在')
      return prisma.membershipPlan.update({ where: { id }, data: rest as any })
    }
    const existingCode = await prisma.membershipPlan.findUnique({ where: { code } })
    if (existingCode) throw new ValidationError('套餐编码已存在')
    return prisma.membershipPlan.create({ data: { code, ...rest } as any })
  }

  private normalizePermissions(value: unknown): Record<string, unknown> {
    const input = value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
    const output: Record<string, unknown> = {}
    const booleans = [
      'canGenerate', 'canCompose', 'canAccessAdmin', 'canRecharge', 'canManageUsers',
      'canExport', 'canPriority', 'canTeam', 'removeWatermark', 'allowHd', 'allow4k',
      'promptLibrary', 'workflowLibrary',
    ]
    for (const key of booleans) output[key] = input[key] === true
    const ranges: Record<string, [number, number, number]> = {
      maxConcurrentGenerations: [1, 20, 1],
      queuePriority: [0, 100, 0],
      storageGb: [1, 10000, 1],
    }
    for (const [key, [min, max, fallback]] of Object.entries(ranges)) {
      const raw = Number(input[key])
      output[key] = Number.isFinite(raw) ? Math.min(max, Math.max(min, Math.floor(raw))) : fallback
    }
    return output
  }

  async deletePlan(id: string) {
    const existing = await prisma.membershipPlan.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('会员套餐不存在')
    await prisma.membershipPlan.delete({ where: { id } })
    return true
  }

  /** 用户当前有效会员（status=active 且未过期） */
  async getUserMemberships(userId: string) {
    const now = new Date()
    return prisma.userMembership.findMany({
      where: {
        userId,
        status: 'active',
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      include: { plan: true },
      orderBy: { startedAt: 'desc' },
    })
  }

  async getEffectiveBenefits(userId: string): Promise<Record<string, unknown>> {
    const memberships = await this.getUserMemberships(userId)
    const result: Record<string, unknown> = {
      maxConcurrentGenerations: 1,
      queuePriority: 0,
      storageGb: 1,
      removeWatermark: false,
      allowHd: false,
      allow4k: false,
      promptLibrary: false,
      workflowLibrary: false,
    }
    for (const membership of memberships) {
      const permissions = membership.plan.permissions && typeof membership.plan.permissions === 'object'
        ? (membership.plan.permissions as Record<string, unknown>)
        : {}
      for (const key of ['maxConcurrentGenerations', 'queuePriority', 'storageGb']) {
        const current = Number(result[key] || 0)
        const next = Number(permissions[key] || 0)
        if (Number.isFinite(next)) result[key] = Math.max(current, next)
      }
      for (const key of ['removeWatermark', 'allowHd', 'allow4k', 'promptLibrary', 'workflowLibrary']) {
        result[key] = result[key] === true || permissions[key] === true
      }
    }
    return result
  }

  /**
   * 购买会员套餐：发放套餐积分 + 建立会员期。
   * 本环境无支付网关，购买即成功（演示）。
   */
  async purchasePlan(userId: string, planCode: string) {
    const plan = await prisma.membershipPlan.findUnique({ where: { code: planCode, isActive: true } })
    if (!plan) throw new NotFoundError('会员套餐不存在或未启用')
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundError('用户不存在')

    const membership = await prisma.$transaction(async (tx) => {
      await creditService.recharge(userId, plan.points, {
        reason: `购买会员套餐-${plan.name}`,
        relatedType: 'membership',
        relatedId: plan.id,
      })
      const startedAt = new Date()
      const expiresAt = plan.durationDays ? new Date(startedAt.getTime() + plan.durationDays * 86400000) : null
      return tx.userMembership.create({
        data: {
          userId,
          planId: plan.id,
          status: 'active',
          pointsGranted: plan.points,
          startedAt,
          expiresAt,
        },
      })
    })
    const balance = await creditService.getBalance(userId)
    return { membership, balance }
  }
}

export const membershipService = new MembershipService()
