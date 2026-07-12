import { ApiResponse, PaginatedResponse } from '@/types'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

/** 请求封装 */
async function request<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const token = localStorage.getItem('access_token')
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
    ...options,
  })

  if (res.status === 401) {
    localStorage.removeItem('access_token')
    window.location.href = '/login'
    throw new Error('未登录或登录已过期')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: '请求失败' }))
    throw new Error(err.message || `HTTP ${res.status}`)
  }

  return res.json()
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

  /** 上传文件 */
  upload: <T>(path: string, file: File, fieldName = 'file') => {
    const token = localStorage.getItem('access_token')
    const formData = new FormData()
    formData.append(fieldName, file)
    return fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then((r) => r.json())
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
  logout: () => api.post('/auth/logout'),
  me: () => api.get<import('@/types').User>('/auth/me'),
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
    api.upload(`/projects/${projectId}/assets`, file),
  getAssets: (projectId: string) =>
    api.get<import('@/types').Asset[]>(`/projects/${projectId}/assets`),
  export: (projectId: string, format: 'png' | 'svg' | 'pdf') =>
    api.post<{ url: string }>(`/projects/${projectId}/export`, { format }),
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
  brief: (data: { businessType: string; clientText: string; constraints?: Record<string, string> }) =>
    api.post<BriefResult>('/ai/brief', data),
  prompt: (data: { brief: import('@/types').BriefData; stylePreference?: string }) =>
    api.post<{ prompts: string[] }>('/ai/prompt', data),
  runWorkflow: (projectId: string, workflowId: string) =>
    api.post(`/ai/workflows/run`, { projectId, workflowId }),
}

// ============================================
// 图片任务 API
// ============================================
export const imageJobApi = {
  create: (data: { projectId?: string; prompt: string; count?: number; ratio?: string; model?: string }) =>
    api.post<{ jobId: string; status: string }>('/image-jobs', data),
  getStatus: (jobId: string) =>
    api.get<import('@/types').GenerationJob & { results?: import('@/types').Asset[] }>(`/image-jobs/${jobId}`),
  poll: async (jobId: string, interval = 3000, maxWait = 120000): Promise<import('@/types').GenerationJob & { results?: import('@/types').Asset[] }> => {
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
}

// ============================================
// 积分 API
// ============================================
export const creditApi = {
  balance: () => api.get<import('@/types').CreditAccount>('/credits/balance'),
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
