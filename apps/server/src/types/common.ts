// 通用类型定义

/** 统一分页响应结构 */
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** 素材类型（与 schema Asset.type 对应，允许业务自定义字符串） */
export type AssetType =
  | 'upload_environment'
  | 'generated_design'
  | 'composited_preview'
  | 'export_png'
  | 'export_pdf'
  | 'export_svg'
  | (string & {})

/** 统一 API 响应结构 */
export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}
