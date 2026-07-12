import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types'

interface AuthState {
  user: User | null
  token: string | null
  setAuth: (user: User, token: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setAuth: (user, token) => {
        localStorage.setItem('access_token', token)
        set({ user, token })
      },
      logout: () => {
        localStorage.removeItem('access_token')
        set({ user: null, token: null })
      },
    }),
    { name: 'adcraft-auth', partialize: (s) => ({ token: s.token }) },
  ),
)

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
