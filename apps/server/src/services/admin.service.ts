import { prisma, imageQueue, compositionQueue } from '../config'
import { NotFoundError, ValidationError, InsufficientBalanceError } from '../utils/errors'
import { PaginatedResponse } from '../types/common'
import { parsePagination, toPaginated } from '../utils/pagination'

export type UserWithCredit = {
  id: string
  phone: string | null
  email: string | null
  nickname: string | null
  status: string
  creditBalance: number
  roleCodes: string[]
  createdAt: Date
  updatedAt: Date
}

export type JobWithUser = {
  id: string
  userId: string
  userNickname: string
  projectId: string | null
  provider: string
  model: string
  jobType: string
  status: string
  prompt: string | null
  creditsFrozen: number
  creditsConsumed: number
  errorMessage: string | null
  createdAt: Date
  finishedAt: Date | null
}

export class AdminService {
  /** 数据总览统计（当天 00:00:00 - 23:59:59） */
  async getOverview() {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

    const [todayGenerations, activeUsers, creditsAgg, failedJobs] = await prisma.$transaction([
      prisma.generationJob.count({ where: { createdAt: { gte: start, lte: end } } }),
      prisma.user.count({ where: { status: 'active', updatedAt: { gte: start } } }),
      prisma.creditTransaction.aggregate({
        _sum: { amount: true },
        where: { type: 'consume', createdAt: { gte: start, lte: end } },
      }),
      prisma.generationJob.count({ where: { status: 'failed' } }),
    ])

    return {
      todayGenerations,
      activeUsers,
      creditsConsumed: Math.abs(creditsAgg._sum.amount || 0),
      failedJobs,
    }
  }

  /** 用户列表（分页 + 搜索） */
  async listUsers(params: {
    page?: number
    pageSize?: number
    search?: string
    status?: string
  }): Promise<PaginatedResponse<UserWithCredit>> {
    const { page, pageSize, skip, take } = parsePagination(params as any)
    const where: any = {}
    if (params.status) where.status = params.status
    if (params.search) {
      const s = params.search.trim()
      where.OR = [
        { nickname: { contains: s, mode: 'insensitive' } },
        { phone: { contains: s } },
        { email: { contains: s, mode: 'insensitive' } },
      ]
    }

    const [total, rows] = await prisma.$transaction([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          creditAccount: true,
          roles: { include: { role: true } },
        },
      }),
    ])

    const items: UserWithCredit[] = rows.map((u: any) => ({
      id: u.id,
      phone: u.phone,
      email: u.email,
      nickname: u.nickname,
      status: u.status,
      creditBalance: u.creditAccount?.balance ?? 0,
      roleCodes: (u.roles || []).map((r: any) => r.role?.code).filter(Boolean),
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }))
    return toPaginated(items, total, page, pageSize)
  }

  /** 用户详情 */
  async getUserDetail(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        creditAccount: true,
        roles: { include: { role: true } },
        creditTransactions: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    })
    if (!user) throw new NotFoundError('用户不存在')
    return user
  }

  /** 调整用户积分（原子：条件更新，扣减时要求余额充足，杜绝负余额 / 竞态） */
  async adjustCredits(
    userId: string,
    operatorId: string,
    amount: number,
    reason?: string,
  ) {
    if (!Number.isFinite(amount) || amount === 0) {
      throw new ValidationError('调整金额必须为非零数字')
    }
    const account = await prisma.creditAccount.findUnique({ where: { userId } })
    if (!account) throw new NotFoundError('用户积分账户不存在')

    // 条件更新：扣减（amount<0）时要求 balance >= -amount；增加（amount>0）时无下限约束。
    // 单条 UPDATE 自带行锁，避免「读后改」竞态导致的负余额 / 双花。
    const minBalance = amount < 0 ? -amount : 0
    const result = await prisma.creditAccount.updateMany({
      where: { userId, balance: { gte: minBalance } },
      data: { balance: { increment: amount } },
    })
    if (result.count === 0) {
      throw new InsufficientBalanceError('积分余额不足，无法扣减到负数')
    }
    const updated = await prisma.creditAccount.findUnique({ where: { userId } })
    await prisma.creditTransaction.create({
      data: {
        userId,
        accountId: account.id,
        type: 'admin_adjust',
        amount,
        balanceAfter: updated!.balance,
        reason: reason || '管理员调整',
        operatorId,
      },
    })
    return { balance: updated!.balance }
  }

  /** 任务列表（分页 + 状态筛选） */
  async listJobs(params: {
    page?: number
    pageSize?: number
    status?: string
    jobType?: string
  }): Promise<PaginatedResponse<JobWithUser>> {
    const { page, pageSize, skip, take } = parsePagination(params as any)
    const where: any = {}
    if (params.status) where.status = params.status
    if (params.jobType) where.jobType = params.jobType

    const [total, rows] = await prisma.$transaction([
      prisma.generationJob.count({ where }),
      prisma.generationJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { user: { select: { nickname: true } } },
      }),
    ])

    const items: JobWithUser[] = rows.map((j: any) => ({
      id: j.id,
      userId: j.userId,
      userNickname: j.user?.nickname || '未知用户',
      projectId: j.projectId,
      provider: j.provider,
      model: j.model,
      jobType: j.jobType,
      status: j.status,
      prompt: j.prompt,
      creditsFrozen: j.creditsFrozen,
      creditsConsumed: j.creditsConsumed,
      errorMessage: j.errorMessage,
      createdAt: j.createdAt,
      finishedAt: j.finishedAt,
    }))
    return toPaginated(items, total, page, pageSize)
  }

  /** 任务详情 */
  async getJobDetail(id: string) {
    const job = await prisma.generationJob.findUnique({
      where: { id },
      include: { user: { select: { nickname: true, phone: true } }, project: true },
    })
    if (!job) throw new NotFoundError('任务不存在')
    return job
  }

  /** 重试失败任务：重置状态并重新入队 */
  async retryJob(jobId: string) {
    const job = await prisma.generationJob.findUnique({ where: { id: jobId } })
    if (!job) throw new NotFoundError('任务不存在')

    const updated = await prisma.generationJob.update({
      where: { id: jobId },
      data: {
        status: 'queued',
        errorMessage: null,
        finishedAt: null,
        startedAt: null,
        creditsConsumed: 0,
      },
    })

    // 重新投递到对应队列，供 Worker 消费
    const payload = {
      generationJobId: job.id,
      jobType: job.jobType,
      provider: job.provider,
      model: job.model,
      prompt: job.prompt,
      requestJson: job.requestJson,
      userId: job.userId,
      projectId: job.projectId,
    }
    try {
      if (job.jobType === 'composition') {
        await compositionQueue.add('composition', payload)
      } else {
        await imageQueue.add('image-generation', payload)
      }
    } catch {
      // 队列不可用时仅重置状态，等待 Worker 后续拉取
    }
    return updated
  }
}

export const adminService = new AdminService()
