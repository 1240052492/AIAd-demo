import { create } from 'zustand'
import type { User, ApiResponse } from '@/types'
import { authApi, creditApi, setAccessToken } from '@/services/api'

interface AuthState {
  user: User | null
  token: string | null
  /** restoreSession() 完成标记：在硬导航 / 刷新页面时，应用必须等它完成后再渲染受保护路由，
   *  否则会抢先以 user=null 发起带鉴权的请求 → 401 → 误弹回 /login。 */
  restored: boolean
  setAuth: (user: User, token: string) => void
  setRestored: (v: boolean) => void
  logout: () => Promise<void>
}

// 注意：access token 仅存于内存（由 @/services/api 的 setAccessToken 统一管理），
// 不再写入 localStorage，避免 XSS 窃取；refresh token 由服务端通过 httpOnly
// Cookie 持有（见 authApi.logout / Agent D 的 /api/auth/refresh）。
export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  token: null,
  restored: false,
  setAuth: (user, token) => {
    setAccessToken(token)
    set({ user, token })
  },
  setRestored: (v) => set({ restored: v }),
  logout: async () => {
    await authApi.logout().catch(() => undefined)
    setAccessToken(null)
    set({ user: null, token: null })
  },
}))

/**
 * 应用启动时调用：用 httpOnly refresh cookie 恢复会话（无需 localStorage）。
 * 成功则回填内存 token 与用户信息；失败（未登录 / cookie 失效）保持未认证态。
 * 注意：此处用原始 fetch 直接调用 /auth/refresh，避免触发 request 封装的
 * 全局 401 跳转（首次无会话访问公开页时不应被强制跳登录）。
 */
export async function restoreSession(): Promise<void> {
  try {
    const base = import.meta.env.VITE_API_BASE_URL || '/api'
    const res = await fetch(`${base}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    })
    if (!res.ok) return
    const json = (await res.json()) as ApiResponse<{ token?: string; accessToken?: string }>
    const token = json?.data?.token ?? json?.data?.accessToken
    if (!token) return
    setAccessToken(token)
    const me = await authApi.me()
    if (me?.data) {
      useAuthStore.getState().setAuth(me.data, token)
      await syncCreditBalance().catch(() => undefined)
    }
  } catch {
    /* 未登录或 refresh 失效，保持未认证态 */
  } finally {
    // 无论成功失败，都标记恢复完成，避免受保护路由在恢复前抢先渲染并误弹回登录页
    useAuthStore.getState().setRestored(true)
  }
}

// 模块加载即尝试恢复会话（SPA 客户端执行，无 SSR）
void restoreSession()

interface CreditState {
  balance: number
  frozenBalance: number
  setBalance: (balance: number, frozenBalance?: number) => void
  deduct: (amount: number) => void
  reset: () => void
}

export const useCreditStore = create<CreditState>()((set) => ({
  balance: 0,
  frozenBalance: 0,
  setBalance: (balance, frozenBalance = 0) => set({ balance, frozenBalance }),
  deduct: (amount) =>
    set((s) => ({ balance: Math.max(0, s.balance - amount) })),
  reset: () => set({ balance: 0, frozenBalance: 0 }),
}))

export async function syncCreditBalance(): Promise<void> {
  const response = await creditApi.balance()
  useCreditStore.getState().setBalance(response.data.balance, response.data.frozenBalance)
}
