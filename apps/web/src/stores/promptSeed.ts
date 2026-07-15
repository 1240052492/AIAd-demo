import { create } from 'zustand'

/**
 * 提示词库 → 首页生成器的解耦桥。
 * 提示词库「使用此提示词」时写入 seedPrompt，首页挂载/更新时读取并填入客户需求输入框，随后清空。
 * 与首页/提示词库页面均无强耦合，避免直接改动彼此组件状态。
 */
interface PromptSeedState {
  seedPrompt: string | null
  setSeedPrompt: (text: string) => void
  clearSeedPrompt: () => void
}

export const usePromptSeed = create<PromptSeedState>((set) => ({
  seedPrompt: null,
  setSeedPrompt: (text) => set({ seedPrompt: text }),
  clearSeedPrompt: () => set({ seedPrompt: null }),
}))
