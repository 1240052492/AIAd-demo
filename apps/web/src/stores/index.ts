import { create } from 'zustand'
import type { User, ApiResponse } from '@/types'
import { authApi, setAccessToken } from '@/services/api'

interface AuthState {
  user: User | null
  token: string | null
  setAuth: (user: User, token: string) => void
  logout: () => void
}

// 注意：access token 仅存于内存（由 @/services/api 的 setAccessToken 统一管理），
// 不再写入 localStorage，避免 XSS 窃取；refresh token 由服务端通过 httpOnly
// Cookie 持有（见 authApi.logout / Agent D 的 /api/auth/refresh）。
export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  token: null,
  setAuth: (user, token) => {
    setAccessToken(token)
    set({ user, token })
  },
  logout: () => {
    // 先通知服务端清除 httpOnly refresh cookie，再清理内存态
    void authApi.logout().catch(() => undefined)
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
    const json = (await res.json()) as ApiResponse<{ token: string }>
    const token = json?.data?.token
    if (!token) return
    setAccessToken(token)
    const me = await authApi.me()
    if (me?.data) {
      useAuthStore.getState().setAuth(me.data, token)
    }
  } catch {
    /* 未登录或 refresh 失效，保持未认证态 */
  }
}

// 模块加载即尝试恢复会话（SPA 客户端执行，无 SSR）
void restoreSession()

interface CreditState {
  balance: number
  frozenBalance: number
  setBalance: (balance: number, frozenBalance?: number) => void
  deduct: (amount: number) => void
}

export const useCreditStore = create<CreditState>()((set) => ({
  balance: 0,
  frozenBalance: 0,
  setBalance: (balance, frozenBalance = 0) => set({ balance, frozenBalance }),
  deduct: (amount) =>
    set((s) => ({ balance: Math.max(0, s.balance - amount) })),
}))
