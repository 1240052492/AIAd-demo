import { api } from '@/services/api'

/**
 * 系统概览（概况）真实聚合指标。
 * 全部来自后端 `GET /api/dashboard`，均为数据库真实计数 / 求和，
 * 前端不做任何硬编码或 mock。
 */
export interface DashboardMetrics {
  /** 累计注册用户数 */
  totalUsers: number
  /** 累计项目数 */
  totalProjects: number
  /** 累计生图（生成）次数 */
  totalGenerations: number
  /** 累计付费充值笔数 */
  paidRecharges: number
  /** 今日充值笔数 */
  todayRecharges: number
  /** 累计充值收入（单位：分） */
  rechargeRevenueCents: number
  /** 累计消耗积分 */
  creditsConsumedTotal: number
  /** 今日生图（生成）次数 */
  todayGenerations: number
  /** 失败任务数 */
  failedJobs: number
  /** 当前活跃会员数 */
  activeMemberships: number
  /** 数据生成时间（ISO 字符串） */
  generatedAt: string
}

/**
 * 拉取系统真实概览数据。
 * 复用 `@/services/api` 的 request 封装：自动携带内存 access token、
 * 自动处理 401 refresh 重放，无需重复实现鉴权逻辑。
 */
export async function getDashboard(): Promise<DashboardMetrics> {
  const res = await api.get<DashboardMetrics>('/dashboard')
  return res.data
}
