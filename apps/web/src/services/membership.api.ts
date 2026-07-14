// ============================================
// 会员 / 积分 前台 API（AGENT_F1）
// 仅封装会员中心、积分超市、积分明细相关接口。
// 复用 @/services/api 中的 request 封装（自动携带 token / refresh）。
// ============================================
import { ApiResponse, PaginatedResponse, CreditTransaction, CreditAccount } from '@/types'
import { api } from '@/services/api'

/** 会员套餐 */
export interface MembershipPlan {
  id: string
  code: string
  name: string
  description?: string
  /** 价格（单位：分 / cents），如 2900 = ¥29.00 */
  price: number
  /** 开通赠送的积分点数 */
  points: number
  durationDays: number
  rate: number
  permissions?: string[]
  isActive: boolean
  sortOrder: number
}

/** 当前用户已开通的会员 */
export interface MyMembership {
  id: string
  planId: string
  status: string
  pointsGranted: number
  startedAt: string
  expiresAt: string
  plan: MembershipPlan
}

/** 购买套餐后的返回 */
export interface PurchaseResult {
  membership: MyMembership
  balance: CreditAccount
}

/** 充值订单（前端仅用于展示） */
export interface RechargeOrder {
  id: string
  amount: number
  status?: string
  [key: string]: unknown
}

export const membershipApi = {
  /** GET /api/membership/plans（公开） */
  getPlans: () => api.get<MembershipPlan[]>('/membership/plans'),

  /** GET /api/membership/mine（需登录） */
  getMine: () => api.get<MyMembership[]>('/membership/mine'),

  /** POST /api/membership/purchase { planCode }（需登录） */
  purchasePlan: (planCode: string) =>
    api.post<PurchaseResult>('/membership/purchase', { planCode }),

  /** GET /api/credits/balance（需登录） */
  getBalance: () => api.get<CreditAccount>('/credits/balance'),

  /** GET /api/credits/transactions?page=&pageSize= */
  getTransactions: (page = 1, pageSize = 20) =>
    api.get<PaginatedResponse<CreditTransaction>>(
      `/credits/transactions?page=${page}&pageSize=${pageSize}`,
    ),

  /** GET /api/credits/rules/public */
  getRules: () => api.get<Record<string, number>>('/credits/rules/public'),

  /** POST /api/credits/recharge { amount }（amount 单位：分，演示环境立即到账） */
  recharge: (amount: number) =>
    api.post<{ order: RechargeOrder; balance: CreditAccount }>('/credits/recharge', { amount }),
}

export type { ApiResponse }
