import { ApiResponse, PaginatedResponse } from '@/types'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

/**
 * Access Token 存储策略（安全升级）：
 *  - 不再写入 localStorage（避免 XSS 窃取），改为内存变量。
 *  - 服务端通过 httpOnly Cookie 持有 refresh token（由 Agent D 的
 *    /api/auth/refresh、/api/auth/logout 管理），fetch 统一带
 *    `credentials: 'include'` 以便浏览器自动附带该 Cookie。
 *  - 登录/注册响应中的 access token 会被 request 层自动捕获进内存。
 *  - 仅在内存中存在时，才在 Authorization 头携带 Bearer token。
 */
let accessToken: string | null = null

/** 写入 / 清除内存中的 access token */
export function setAccessToken(token: string | null): void {
  accessToken = token
}

/** 读取内存中的 access token */
export function getAccessToken(): string | null {
  return accessToken
}

/**
 * 调用 /api/auth/refresh 用 httpOnly refresh cookie 换发新的 access token。
 * 成功返回新 token，失败（cookie 失效 / 未登录）返回 null。
 */
async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    })
    if (!res.ok) return null
    const json = (await res.json()) as ApiResponse<{ token?: string; accessToken?: string }>
    const token = json?.data?.token ?? json?.data?.accessToken
    if (token) {
      accessToken = token
      return token
    }
    return null
  } catch {
    return null
  }
}

/** 统一跳转登录页并清理内存 token */
function redirectToLogin(): void {
  accessToken = null
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.href = '/login'
  }
}

/**
 * 请求封装。
 * - 自动附带 credentials: 'include'（httpOnly refresh cookie）。
 * - 自动携带内存中的 access token（Bearer）。
 * - 响应若携带 { data: { token } }（登录 / 注册 / 刷新），自动写入内存。
 * - 遇到 401 先尝试一次 refresh 并重放原请求；仍失败则跳转登录。
 */
async function request<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const makeFetch = (token?: string | null) =>
    fetch(`${BASE_URL}${path}`, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options?.headers,
      },
      ...options,
    })

  let res = await makeFetch(accessToken)

  // 401：无论内存是否已有 token，都先尝试用 httpOnly refresh cookie 换发新 token 并重放一次。
  // 这样在「硬导航 / 刷新页面」场景下，即使内存 token 尚未被 restoreSession 回填，
  // 也能凭 refresh cookie 自愈会话，避免把已登录用户误弹回 /login（此前 03-dashboard / 07-editor 截图被弹回登录页）。
  if (res.status === 401) {
    const newToken = await refreshAccessToken()
    if (newToken) {
      res = await makeFetch(newToken)
    }
  }

  if (res.status === 401) {
    redirectToLogin()
    throw new Error('未登录或登录已过期')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: '请求失败' }))
    throw new Error((err as { message?: string }).message || `HTTP ${res.status}`)
  }

  const json = (await res.json()) as ApiResponse<T>
  // 自动捕获登录 / 注册 / 刷新返回的 access token（优先 accessToken，兼容旧 token 字段）
  const returned = (json as unknown as { data?: { token?: string; accessToken?: string } })?.data
  if (returned?.accessToken || returned?.token) {
    accessToken = returned.accessToken ?? returned.token ?? null
  }
  return json
}

export const api = {
  /** GET 请求 */
  get: <T>(path: string) => request<T>(path),

  /** POST 请求 */
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: data ? JSON.stringify(data) : undefined }),

  /** PATCH 请求 */
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PATCH', body: data ? JSON.stringify(data) : undefined }),

  /** DELETE 请求 */
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),

  /** 上传文件（同样带 credentials: 'include' 与内存 token） */
  upload: <T>(path: string, file: File, fieldName = 'file') => {
    const formData = new FormData()
    formData.append(fieldName, file)
    return fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      body: formData,
    }).then((r) => r.json() as Promise<ApiResponse<T>>)
  },
}

// ============================================
// 认证 API
// ============================================
export const authApi = {
  login: (data: { phone?: string; email?: string; password: string }) =>
    api.post<{ token: string; user: import('@/types').User }>('/auth/login', data),
  register: (data: { phone?: string; email?: string; password: string; nickname?: string }) =>
    api.post<{ token: string; user: import('@/types').User }>('/auth/register', data),
  // 用 httpOnly refresh cookie 换发新的 access token（Agent D 的 /api/auth/refresh）
  refresh: () => api.post<{ token: string }>('/auth/refresh'),
  // 退出：服务端清除 httpOnly refresh cookie（Agent D），前端清理内存 token
  logout: async () => {
    await api.post('/auth/logout').catch(() => undefined)
    accessToken = null
  },
  me: () => api.get<import('@/types').User>('/auth/me'),
}

/**
 * 打开实时进度 WebSocket（同源，浏览器自动附带 httpOnly cookie）。
 * @param jobId 要订阅的任务 ID
 * @returns WebSocket 实例，调用方自行监听 message / 关闭连接
 *
 * 消息结构（服务端 → 客户端）：
 *   { "type": "connected", "jobId": string | null }
 *   { "type": "progress", "jobId": string, "stage": string,
 *     "percent": number, "message"?: string }
 */
export function connectProgressWs(jobId: string): WebSocket {
  const proto = typeof location !== 'undefined' && location.protocol === 'https:' ? 'wss' : 'ws'
  const host = typeof location !== 'undefined' ? location.host : '127.0.0.1:4177'
  return new WebSocket(`${proto}://${host}/ws?jobId=${encodeURIComponent(jobId)}`)
}

// ============================================
// 项目 API
// ============================================
export const projectApi = {
  list: (params?: { page?: number; pageSize?: number; businessType?: string; status?: string }) =>
    api.get<PaginatedResponse<import('@/types').Project>>(`/projects?${new URLSearchParams(params as Record<string, string>).toString()}`),
  create: (data: { title: string; businessType: string; briefJson?: object }) =>
    api.post<import('@/types').Project>('/projects', data),
  detail: (id: string) => api.get<import('@/types').Project>(`/projects/${id}`),
  update: (id: string, data: Partial<import('@/types').Project>) =>
    api.patch<import('@/types').Project>(`/projects/${id}`, data),
  uploadAsset: (projectId: string, file: File) =>
    api.upload<import('@/types').Asset>(`/projects/${projectId}/assets`, file),
  getAssets: (projectId: string) =>
    api.get<import('@/types').Asset[]>(`/projects/${projectId}/assets`),
  export: (projectId: string, format: 'png' | 'svg' | 'pdf') =>
    api.post<{ url: string }>(`/projects/${projectId}/export`, { format }),
}

// ============================================
// 首页工作台 API
// ============================================
export const compositionJobApi = {
  create: (data: {
    projectId: string
    environmentAssetId: string
    designAssetId: string
    position?: { x: number; y: number; width: number; height: number }
    outputFormat?: 'png' | 'jpeg'
    requiredVisibleTexts?: string[]
  }) => api.post<{ jobId: string; status: string }>('/composition-jobs', data),
}

export const vectorAssetApi = {
  create: (data: { svg: string; projectId?: string; jobId?: string }) =>
    api.post<{ asset: import('@/types').Asset }>('/vector-assets', data),
}

// ============================================
// AI API
// ============================================
/** /api/ai/brief 返回的结构化结果（顶层携带 missingQuestions / productionNotes / riskWarnings） */
export interface BriefResult {
  brief: import('@/types').BriefData
  missingQuestions: string[]
  productionNotes: string[]
  riskWarnings: string[]
  imagePrompt: string
}

export const aiApi = {
  brief: (data: { businessType: string; clientText: string; constraints?: Record<string, string>; mock?: boolean }) =>
    api.post<BriefResult>('/ai/brief', data),
  prompt: (data: { brief: import('@/types').BriefData; stylePreference?: string; mock?: boolean }) =>
    api.post<{ prompts: string[] }>('/ai/prompt', data),
  runWorkflow: (projectId: string, workflowId: string) =>
    api.post(`/ai/workflows/run`, { projectId, workflowId }),
}

// ============================================
// 图片任务 API
// ============================================
export const imageJobApi = {
  create: (data: {
    projectId?: string
    prompt: string
    count?: number
    ratio?: string
    model?: string
    requiredVisibleTexts?: string[]
    mock?: boolean
  }) =>
    api.post<{ jobId: string; status: string }>('/image-jobs', data),
  getStatus: (jobId: string) =>
    api.get<
      import('@/types').GenerationJob & {
        results?: import('@/types').Asset[]
        responseJson?: {
          textValidation?: import('@/types').TextValidationRecord
          textCorrections?: import('@/types').TextCorrection[]
          correctedAssets?: import('@/types').Asset[]
          assetId?: string
          url?: string
        }
      }
    >(`/image-jobs/${jobId}`),
  poll: async (jobId: string, interval = 3000, maxWait = 120000): Promise<import('@/types').GenerationJob & { results?: import('@/types').Asset[]; responseJson?: any }> => {
    const start = Date.now()
    while (Date.now() - start < maxWait) {
      const job = await imageJobApi.getStatus(jobId)
      if (job.data.status === 'succeeded' || job.data.status === 'failed' || job.data.status === 'canceled') {
        return job.data
      }
      await new Promise((r) => setTimeout(r, interval))
    }
    throw new Error('任务超时')
  },
  validateText: (jobId: string) =>
    api.post<{ job: import('@/types').GenerationJob; textValidation: import('@/types').TextValidationRecord }>(
      `/image-jobs/${jobId}/text-validation`,
      {},
    ),
  applyTextCorrections: (jobId: string, corrections: import('@/types').TextCorrection[]) =>
    api.post<{ job: import('@/types').GenerationJob; asset: import('@/types').Asset }>(
      `/image-jobs/${jobId}/text-corrections`,
      { corrections },
    ),
}

// ============================================
// 积分 API
// ============================================
export const creditApi = {
  balance: () => api.get<import('@/types').CreditAccount>('/credits/balance'),
  rules: () => api.get<Record<string, number>>('/credits/rules/public'),
  transactions: (params?: { page?: number; pageSize?: number }) =>
    api.get<PaginatedResponse<import('@/types').CreditTransaction>>(
      `/credits/transactions?${new URLSearchParams(params as Record<string, string>).toString()}`
    ),
}

// ============================================
// 模板 API
// ============================================
export const templateApi = {
  list: (params?: { category?: string; businessType?: string; page?: number; pageSize?: number }) =>
    api.get<PaginatedResponse<import('@/types').Template>>(
      `/templates?${new URLSearchParams(params as Record<string, string>).toString()}`
    ),
  detail: (id: string) => api.get<import('@/types').Template>(`/templates/${id}`),
}
