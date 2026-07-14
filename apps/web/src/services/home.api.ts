import { api } from './api'

/**
 * 首页工作台专用的图片任务请求封装。
 *
 * 与共享的 `imageJobApi` 不同的是，这里额外携带：
 *  - `model`：用户在前端选择的生图模型（默认 gpt-image-2）。
 *  - `polishPrompt`：AI 润色提示词，用于与画布编辑器建立契约。
 *    后端 /api/image-jobs 当前可能忽略该字段，但前端按契约发送，
 *    便于后续编辑器 / 服务端消费（见 Agent F4 与编辑器 Agent 的约定）。
 *
 * 注意：不要修改共享的 `src/services/api.ts`，所有首页专属封装放这里。
 */
export interface HomeImageJobRequest {
  projectId?: string
  prompt: string
  count?: number
  ratio?: string
  model?: string
  requiredVisibleTexts?: string[]
  mock?: boolean
  /** AI 润色提示词（携带至画布编辑器的契约字段） */
  polishPrompt?: string
}

export const homeImageJobApi = {
  create: (data: HomeImageJobRequest) =>
    api.post<{ jobId: string; status: string }>('/image-jobs', data),
}
