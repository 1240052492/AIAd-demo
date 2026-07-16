import { create } from 'zustand'
import type { User, ApiResponse } from '@/types'
import { authApi, creditApi, refreshAccessToken, setAccessToken } from '@/services/api'

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
 *
 * 单飞锁：同一页面生命周期内并发/重复调用复用同一 Promise，避免并行 refresh
 * 旋转令牌导致偶发会话失效（F5 跳登录）。
 */
let restoreSessionPromise: Promise<void> | null = null

export function restoreSession(): Promise<void> {
  if (restoreSessionPromise) return restoreSessionPromise

  restoreSessionPromise = (async () => {
    try {
      const base = import.meta.env.VITE_API_BASE_URL || '/api'
      // 与普通请求的 401 自愈共用同一个 refresh 单飞锁，避免两个入口并发旋转 Cookie。
      const token = await refreshAccessToken()
      if (!token) return
      setAccessToken(token)

      const meRes = await fetch(`${base}/auth/me`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })
      if (!meRes.ok) {
        // refresh 成功但 me 失败：保留 token 与 cookie，不清理有效会话
        setAccessToken(token)
        return
      }
      const meJson = (await meRes.json()) as ApiResponse<User>
      if (meJson?.data) {
        useAuthStore.getState().setAuth(meJson.data, token)
        await syncCreditBalance().catch(() => undefined)
      }
    } catch {
      /* 未登录或 refresh 失效：不主动清除 cookie，保持未认证内存态即可 */
    } finally {
      // 仅在本轮原始恢复流程结束后标记，并发调用者共享此 Promise
      useAuthStore.getState().setRestored(true)
    }
  })()

  return restoreSessionPromise
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
