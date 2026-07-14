import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { prisma } from '../config'
import { ok, fail } from '../utils/response'

const router = Router()

function startOfToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
}

/**
 * GET /api/dashboard
 * 返回系统真实聚合数据（全部来自数据库实时统计，不使用任何假数据）。
 * 普通用户看到自身维度；管理员看到全局维度（这里统一返回全局真实数据，前端按需展示）。
 */
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const now = new Date()
    const todayStart = startOfToday()
    const todayEnd = new Date(todayStart.getTime() + 86400000 - 1)

    const [
      totalUsers,
      totalProjects,
      totalGenerations,
      paidRecharges,
      rechargeAgg,
      creditConsumedAgg,
      todayGenerations,
      failedJobs,
      activeMemberships,
      todayRecharges,
    ] = await prisma.$transaction([
      prisma.user.count(),
      prisma.project.count(),
      prisma.generationJob.count(),
      prisma.rechargeOrder.count({ where: { status: 'paid' } }),
      prisma.rechargeOrder.aggregate({ _sum: { amount: true }, where: { status: 'paid' } }),
      prisma.creditTransaction.aggregate({ _sum: { amount: true }, where: { type: 'consume' } }),
      prisma.generationJob.count({ where: { createdAt: { gte: todayStart, lte: todayEnd } } }),
      prisma.generationJob.count({ where: { status: 'failed' } }),
      prisma.userMembership.count({ where: { status: 'active' } }),
      prisma.rechargeOrder.count({ where: { status: 'paid', paidAt: { gte: todayStart, lte: todayEnd } } }),
    ])

    return ok(res, {
      totalUsers,
      totalProjects,
      totalGenerations,
      paidRecharges,
      todayRecharges,
      rechargeRevenueCents: rechargeAgg._sum.amount || 0,
      creditsConsumedTotal: Math.abs(creditConsumedAgg._sum.amount || 0),
      todayGenerations,
      failedJobs,
      activeMemberships,
      generatedAt: now.toISOString(),
    })
  } catch (err) {
    return fail(res, 500, (err as Error).message || '统计失败')
  }
})

export { router as dashboardRoutes }
