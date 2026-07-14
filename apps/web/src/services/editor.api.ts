// ============================================
// 编辑器专属 API（不改动共享 api.ts）
// 用于「携带图生图」流程：把基础图 + AI 润色提示词 + 标注批注
// 发送到生图接口（mock 模式走本地占位图），取回新图加载到画布。
// ============================================
import { api, imageJobApi } from '@/services/api'

/** 标注类型（与 AIhuabu 标注工具对齐） */
export type AnnotationType = 'rect' | 'arrow' | 'text' | 'select'

/** 单条标注的数据模型（随 regenerate 一起发给后端） */
export interface EditorAnnotation {
  id: string
  type: AnnotationType
  /** 画布坐标系下的左上角 x */
  x: number
  /** 画布坐标系下的左上角 y */
  y: number
  /** 包围盒宽 */
  w: number
  /** 包围盒高 */
  h: number
  /** 文字批注内容（type === 'text' 时存在） */
  text?: string
}

export interface RegeneratePayload {
  /** AI 润色提示词 */
  prompt: string
  /** 用户添加的修改批注（门控条件：至少为 1 条才允许 regenerate） */
  annotations: EditorAnnotation[]
  /** 携带的基础图 URL */
  seedImg?: string
  /** 生图比例 */
  ratio?: string
  /** 是否走本地 mock（smoke 用） */
  mock?: boolean
}

export interface RegenerateResult {
  jobId: string
  /** 生成的图片 URL（mock 为占位图） */
  imageUrl: string
}

/**
 * 向 /api/image-jobs 提交一次「基于批注的重新生成」。
 * - mock:true：服务端立即成功并返回 results[0].url。
 * - 标注数组随请求体发送（服务端忽略未知字段，不影响 smoke）。
 */
export const editorApi = {
  async regenerate(payload: RegeneratePayload): Promise<RegenerateResult> {
    const { prompt, annotations, seedImg, ratio = '9:16', mock = true } = payload

    const createResp = await api.post<{ jobId: string; status: string }>('/image-jobs', {
      prompt,
      ratio,
      mock,
      annotations,
      seedImg,
    })
    const jobId = createResp.data?.jobId
    if (!jobId) {
      throw new Error('未获取到生图任务 ID')
    }

    const job = await imageJobApi.getStatus(jobId)
    const data = (job.data ?? {}) as Record<string, any>
    const results: any[] =
      data.responseJson && Array.isArray(data.responseJson.results)
        ? data.responseJson.results
        : Array.isArray(data.results)
          ? data.results
          : []
    const imageUrl: string =
      (results[0] && results[0].url) || (data.responseJson && data.responseJson.url) || ''

    return { jobId, imageUrl }
  },
}

export default editorApi
