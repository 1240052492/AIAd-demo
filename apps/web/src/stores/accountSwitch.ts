import { create } from 'zustand'

export type AccountType = 'personal' | 'enterprise'

interface AccountSwitchState {
  accountType: AccountType
  setAccountType: (t: AccountType) => void
  reset: () => void
}

/**
 * 个人 / 企业账户切换（纯前端占位，无后端接口）。
 * 独立 store，避免与其他 agent 修改共享的 stores/index.ts 冲突。
 */
export const useAccountSwitch = create<AccountSwitchState>()((set) => ({
  accountType: 'personal',
  setAccountType: (accountType) => set({ accountType }),
  reset: () => set({ accountType: 'personal' }),
}))
