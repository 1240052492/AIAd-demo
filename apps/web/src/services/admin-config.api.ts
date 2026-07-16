// ============================================
// 后台权限 / 会员 / 充值 / 用户角色 配置 API
// 仅前端新增文件，不修改 src/services/api.ts
// 复用 api.ts 暴露的 getAccessToken()，自行封装 PUT 等请求（api 对象无 put 方法）
// ============================================
import { api, getAccessToken } from './api'
import type { ApiResponse, PaginatedResponse } from '@/types'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

/**
 * 后台专用请求封装：与 api.ts 行为一致（credentials: 'include' + 内存 Bearer token），
 * 额外支持 PUT 方法（api 对象未提供）。GET/POST/DELETE 走 adminConfigApi 时统一用本函数。
 */
async function adminRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getAccessToken()
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: '请求失败' }))
    throw new Error((err as { message?: string }).message || `HTTP ${res.status}`)
  }
  const json = (await res.json()) as ApiResponse<T>
  return json.data
}

// ============================================
// 类型
// ============================================
export type RoleCode = 'admin' | 'agent' | 'user' | 'guest'

export interface RolePermissions {
  canGenerate: boolean
  canCompose: boolean
  canAccessAdmin: boolean
  canRecharge: boolean
  canManageUsers: boolean
  canExport: boolean
  canPriority: boolean
  canTeam: boolean
}

export interface MembershipBenefits extends RolePermissions {
  maxConcurrentGenerations?: number
  queuePriority?: number
  storageGb?: number
  removeWatermark?: boolean
  allowHd?: boolean
  allow4k?: boolean
  promptLibrary?: boolean
  workflowLibrary?: boolean
}

export interface RoleConfig {
  roleCode: RoleCode
  rate: number
  permissions: RolePermissions
}

export interface MembershipPlan {
  id: string
  code: string
  name: string
  description?: string
  /** 价格，单位：分 */
  price: number
  points: number
  durationDays: number
  /** 积分消耗折扣系数（1 = 原价，0.7 = 7 折） */
  rate: number
  permissions: MembershipBenefits
  isActive: boolean
  sortOrder: number
}

/** 创建 / 编辑套餐的入参（不含 id） */
export type PlanInput = Omit<MembershipPlan, 'id'>

export interface ForbiddenWord {
  id: string
  word: string
  category: string
  matchType: 'contains' | 'whole_word'
  action: 'block' | 'flag' | 'replace'
  replacement?: string | null
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export type ForbiddenWordInput = Omit<ForbiddenWord, 'id' | 'createdAt' | 'updatedAt'>

export type RechargeStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'canceled'

export interface RechargeRecord {
  id: string
  userId: string
  orderNo: string
  /** 金额，单位：元 */
  amount: number
  points: number
  rate: number
  status: RechargeStatus
  payChannel?: string | null
  paidAt?: string | null
  createdAt: string
  user?: { nickname?: string; email?: string } | null
}

export interface AdminUserRow {
  id: string
  phone?: string | null
  email?: string | null
  nickname?: string | null
  status: string
  creditBalance: number
  /** 权限依赖项：用户实际生效的角色 code 列表 */
  roleCodes: string[]
  createdAt: string
}

/** 管理员创建用户入参 */
export interface CreateUserInput {
  phone?: string
  email?: string
  nickname?: string
  password: string
  roleCode?: RoleCode
  initialCredits?: number
}

/** 管理员编辑用户入参（全部可选，仅传需要改的字段） */
export interface UpdateUserInput {
  phone?: string
  email?: string
  nickname?: string
  /** 留空则不改密码 */
  password?: string
  status?: 'active' | 'disabled' | 'banned'
}

// ============================================
// 其他后台面板类型与接口（真实数据联动）
// ============================================
export interface OverviewData {
  todayGenerations: number
  activeUsers: number
  creditsConsumed: number
  failedJobs: number
}

export type OverviewDetailType = 'generations' | 'activeUsers' | 'credits' | 'failedJobs'

export interface OverviewActiveUser {
  id: string
  nickname: string | null
  phone: string | null
  email: string | null
  updatedAt: string
}

export interface OverviewCreditRow {
  id: string
  userId: string
  userNickname: string
  amount: number
  reason: string | null
  createdAt: string
}

export type OverviewDetailRow = GenerationJob | OverviewActiveUser | OverviewCreditRow

export interface ProviderConfig {
  id: string
  provider: string
  displayName: string
  baseUrl: string
  model: string
  enabled: boolean
  priority: number
  configJson?: unknown
  createdAt: string
  updatedAt: string
}
export type ProviderConfigInput = Partial<
  Pick<ProviderConfig, 'provider' | 'displayName' | 'baseUrl' | 'model' | 'enabled' | 'priority' | 'configJson'>
>

export type ProviderConfigCreate = {
  provider: string
  displayName: string
  baseUrl?: string
  model?: string
  enabled?: boolean
  priority?: number
  configJson?: unknown
}

export type CreditRules = {
  registerBonus: number
  imageGeneration: number
  composition: number
  exportPng: number
  exportPdf: number
  exportSvg: number
}

export interface WorkflowTemplate {
  id: string
  title: string
  businessType: string
  description?: string | null
  stepsJson?: unknown
  creditRuleJson?: unknown
  isPublic: boolean
  createdAt: string
}
export type WorkflowTemplateInput = {
  title: string
  businessType?: string
  description?: string
  stepsJson?: unknown
  creditRuleJson?: unknown
  isPublic?: boolean
}

export interface GenerationJob {
  id: string
  userId: string
  userNickname: string
  projectId?: string | null
  provider?: string | null
  model?: string | null
  jobType: string
  status: string
  prompt?: string | null
  creditsFrozen?: number | null
  creditsConsumed?: number | null
  errorMessage?: string | null
  responseJson?: unknown
  requestJson?: unknown
  createdAt: string
  finishedAt?: string | null
}

export interface SiteSettings {
  siteName: string
  allowGuestBrowse: boolean
  maintenanceMode: boolean
  maxUploadMb: number
  industries: string[]
  recommendedTemplates: string[]
  announcement: string
}

// ============================================
// 后台配置 API
// ============================================
export const adminConfigApi = {
  // ---- 角色权限配置 ----
  getRoleConfigs: () => adminRequest<RoleConfig[]>('GET', '/admin/role-configs'),
  updateRoleConfig: (code: RoleCode, data: Partial<Pick<RoleConfig, 'rate' | 'permissions'>>) =>
    adminRequest<RoleConfig>('PUT', `/admin/role-configs/${code}`, data),

  // ---- 会员套餐 ----
  getPlans: () => adminRequest<MembershipPlan[]>('GET', '/admin/membership-plans'),
  createPlan: (data: PlanInput) =>
    adminRequest<MembershipPlan>('POST', '/admin/membership-plans', data),
  updatePlan: (id: string, data: Partial<PlanInput>) =>
    adminRequest<MembershipPlan>('PUT', `/admin/membership-plans/${id}`, data),
  deletePlan: (id: string) => adminRequest<unknown>('DELETE', `/admin/membership-plans/${id}`),

  // ---- 充值记录 ----
  getRecharges: (params?: { page?: number; pageSize?: number; status?: string }) =>
    adminRequest<PaginatedResponse<RechargeRecord>>(
      'GET',
      `/admin/recharges?${new URLSearchParams(
        (params as Record<string, string>) ?? {},
      ).toString()}`,
    ),

  // ---- 用户 + 角色 ----
  getUsers: (params?: { page?: number; pageSize?: number; search?: string; status?: string }) =>
    adminRequest<PaginatedResponse<AdminUserRow>>(
      'GET',
      `/admin/users?${new URLSearchParams(
        (params as Record<string, string>) ?? {},
      ).toString()}`,
    ),
  /** 创建用户（管理员） */
  createUser: (data: CreateUserInput) =>
    adminRequest<AdminUserRow>('POST', '/admin/users', data),
  /** 编辑用户基础信息 / 密码 / 状态 */
  updateUser: (id: string, data: UpdateUserInput) =>
    adminRequest<AdminUserRow>('PATCH', `/admin/users/${id}`, data),
  /** 删除用户（级联清理） */
  deleteUser: (id: string) => adminRequest<{ id: string }>('DELETE', `/admin/users/${id}`),
  /** 设置用户角色 —— 实际会让权限生效（重新登录后生效） */
  setUserRoles: (id: string, roleCodes: string[]) =>
    adminRequest<unknown>('PUT', `/admin/users/${id}/roles`, { roleCodes }),
  patchUserStatus: (id: string, status: 'active' | 'disabled' | 'banned') =>
    adminRequest<unknown>('PATCH', `/admin/users/${id}/status`, { status }),
  adjustCredits: (id: string, amount: number, reason?: string) =>
    adminRequest<unknown>('POST', `/admin/users/${id}/credits/adjust`, { amount, reason }),

  // ---- 数据总览 ----
  getOverview: () => adminRequest<OverviewData>('GET', '/admin/overview'),
  getOverviewDetails: (params: { type: OverviewDetailType; page?: number; pageSize?: number }) => {
    const qs = new URLSearchParams()
    qs.set('type', params.type)
    if (params.page !== undefined) qs.set('page', String(params.page))
    if (params.pageSize !== undefined) qs.set('pageSize', String(params.pageSize))
    return adminRequest<PaginatedResponse<OverviewDetailRow>>('GET', `/admin/overview/details?${qs.toString()}`)
  },

  // ---- Provider 配置（增删改查；敏感 key 不经前端） ----
  getProviderConfigs: () => adminRequest<ProviderConfig[]>('GET', '/admin/provider-configs'),
  createProviderConfig: (data: ProviderConfigCreate) =>
    adminRequest<ProviderConfig>('POST', '/admin/provider-configs', data),
  updateProviderConfig: (id: string, data: ProviderConfigInput) =>
    adminRequest<ProviderConfig>('PATCH', `/admin/provider-configs/${id}`, data),
  deleteProviderConfig: (id: string) =>
    adminRequest<{ id: string }>('DELETE', `/admin/provider-configs/${id}`),

  // ---- 违禁词库 ----
  getForbiddenWords: () => adminRequest<ForbiddenWord[]>('GET', '/admin/forbidden-words'),
  createForbiddenWord: (data: ForbiddenWordInput) =>
    adminRequest<ForbiddenWord>('POST', '/admin/forbidden-words', data),
  updateForbiddenWord: (id: string, data: Partial<ForbiddenWordInput>) =>
    adminRequest<ForbiddenWord>('PATCH', `/admin/forbidden-words/${id}`, data),
  deleteForbiddenWord: (id: string) =>
    adminRequest<{ id: string }>('DELETE', `/admin/forbidden-words/${id}`),

  // ---- 积分规则 ----
  getCreditRules: () => adminRequest<CreditRules>('GET', '/admin/credit-rules'),
  updateCreditRules: (data: CreditRules) =>
    adminRequest<CreditRules>('PUT', '/admin/credit-rules', data),

  /** 管理员全量积分流水：GET /api/admin/credit-transactions（非 overview/details） */
  getCreditTransactions: (params?: {
    page?: number
    pageSize?: number
    type?: string
    search?: string
  }) => {
    const qs = new URLSearchParams()
    if (params?.page !== undefined) qs.set('page', String(params.page))
    if (params?.pageSize !== undefined) qs.set('pageSize', String(params.pageSize))
    if (params?.type) qs.set('type', params.type)
    if (params?.search) qs.set('search', params.search)
    return adminRequest<
      PaginatedResponse<{
        id: string
        userId: string
        userName: string
        userEmail: string | null
        type: string
        amount: number
        balanceAfter: number
        reason: string | null
        relatedType: string | null
        relatedId: string | null
        operatorName: string | null
        createdAt: string
      }>
    >('GET', `/admin/credit-transactions?${qs.toString()}`)
  },

  // ---- 工作流模板 ----
  listWorkflows: (params?: { page?: number; pageSize?: number; businessType?: string }) =>
    adminRequest<PaginatedResponse<WorkflowTemplate>>(
      'GET',
      `/admin/workflows?${new URLSearchParams((params as Record<string, string>) ?? {}).toString()}`,
    ),
  createWorkflow: (data: WorkflowTemplateInput) =>
    adminRequest<WorkflowTemplate>('POST', '/admin/workflows', data),
  updateWorkflow: (id: string, data: Partial<WorkflowTemplateInput>) =>
    adminRequest<WorkflowTemplate>('PATCH', `/admin/workflows/${id}`, data),
  deleteWorkflow: (id: string) =>
    adminRequest<unknown>('DELETE', `/admin/workflows/${id}`),

  // ---- 生成任务队列 ----
  listJobs: (params?: { page?: number; pageSize?: number; status?: string; jobType?: string }) => {
    const qs = new URLSearchParams()
    if (params?.page !== undefined) qs.set('page', String(params.page))
    if (params?.pageSize !== undefined) qs.set('pageSize', String(params.pageSize))
    if (params?.status) qs.set('status', params.status)
    if (params?.jobType) qs.set('jobType', params.jobType)
    return adminRequest<PaginatedResponse<GenerationJob>>('GET', `/admin/generation-jobs?${qs.toString()}`)
  },
  getJob: (id: string) => adminRequest<GenerationJob & { responseJson?: unknown }>('GET', `/admin/generation-jobs/${id}`),
  retryJob: (id: string) => adminRequest<GenerationJob>('POST', `/admin/generation-jobs/${id}/retry`),
  pauseJob: (id: string) => adminRequest<GenerationJob>('POST', `/admin/generation-jobs/${id}/pause`),
  refundJob: (id: string) => adminRequest<GenerationJob>('POST', `/admin/generation-jobs/${id}/refund`),

  // ---- 系统设置 ----
  getSettings: () => adminRequest<SiteSettings>('GET', '/admin/settings'),
  updateSettings: (data: Partial<SiteSettings>) =>
    adminRequest<SiteSettings>('PUT', '/admin/settings', data),

  // ---- 后台模板管理 ----
  listAdminTemplates: (
    params?: { page?: number; pageSize?: number; isPublic?: string; category?: string; businessType?: string },
  ) =>
    adminRequest<PaginatedResponse<import('@/types').Template>>(
      'GET',
      `/admin/templates?${new URLSearchParams((params as Record<string, string>) ?? {}).toString()}`,
    ),
  createAdminTemplate: (data: unknown) =>
    adminRequest<import('@/types').Template>('POST', '/admin/templates', data),
  updateAdminTemplate: (id: string, data: unknown) =>
    adminRequest<import('@/types').Template>('PATCH', `/admin/templates/${id}`, data),
  deleteAdminTemplate: (id: string) =>
    adminRequest<unknown>('DELETE', `/admin/templates/${id}`),
}

// 兼容旧调用：暴露一个 get 便捷别名（部分页面需要直接 GET）
export const adminGet = <T>(path: string) => api.get<T>(path)
