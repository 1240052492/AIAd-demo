// ============================================
// AdCraft AI - 前端类型定义
// ============================================

/** 用户 */
export interface User {
  id: string
  phone?: string
  email?: string
  nickname?: string
  role?: 'admin' | 'user'
  status: string
  createdAt: string
}

/** 项目 */
export interface Project {
  id: string
  title: string
  businessType: string
  status: 'draft' | 'generating' | 'editing' | 'completed' | 'exported'
  briefJson?: BriefData
  createdAt: string
  updatedAt: string
}

/** Brief 数据结构 */
export interface BriefData {
  businessType: string
  targetAudience?: string
  visualDirection?: string
  missingQuestions?: string[]
  storeName?: string
  industry?: string
  style?: string
  dimensions?: string
  material?: string
  lighting?: string
  budget?: string
  referenceNotes?: string
}

/** 素材 */
export interface Asset {
  id: string
  type: AssetType
  url: string
  mimeType?: string
  width?: number
  height?: number
  metadataJson?: Record<string, unknown>
}

export type AssetType =
  | 'upload_environment'
  | 'generated_design'
  | 'composited_preview'
  | 'export_png'
  | 'export_pdf'
  | 'export_svg'

/** 生成任务 */
export interface GenerationJob {
  id: string
  provider: string
  model: string
  jobType: JobType
  status: JobStatus
  prompt?: string
  creditsFrozen: number
  creditsConsumed: number
  results?: Asset[]
  startedAt?: string
  finishedAt?: string
  createdAt: string
}

export type JobType = 'brief' | 'prompt' | 'image_generation' | 'composition' | 'export'

export type JobStatus = 'queued' | 'submitted' | 'processing' | 'succeeded' | 'failed' | 'canceled'

/** 模板 */
export interface Template {
  id: string
  title: string
  category: string
  businessType: string
  coverUrl?: string
  prompt: string
  configJson?: Record<string, unknown>
}

/** 积分流水 */
export interface CreditTransaction {
  id: string
  type: string
  amount: number
  balanceAfter: number
  relatedType?: string
  reason?: string
  createdAt: string
}

/** 积分账户 */
export interface CreditAccount {
  balance: number
  frozenBalance: number
}

/** 工作流步骤 */
export interface WorkflowStep {
  role: string
  name: string
  description: string
  icon: string
}

/** 业务类型选项 */
export const BUSINESS_TYPES = [
  { key: 'storefront_sign', label: '门头招牌', desc: '发光字、底板、灯箱' },
  { key: 'culture_wall', label: '墙体文化', desc: '文化墙、展板、美陈' },
  { key: 'ad_material', label: '广告物料', desc: '海报、喷绘、易拉宝' },
  { key: 'brand_vi', label: '品牌 VI', desc: 'Logo、辅助图形、物料' },
  { key: 'construction', label: '施工输出', desc: '尺寸、材质、安装说明' },
] as const

/** 模板分类 */
export const TEMPLATE_CATEGORIES = [
  '全部', '展板', '品牌物料', '图形设计', '字体设计', '品牌设计',
  '文化墙', '易拉宝展示', '展厅', '餐饮海报', '菜单', '标识牌',
  '海报', '节日海报', '摄影修图', 'LOGO', '门头招牌', '美陈',
  '企业文化墙', '卡通图',
]

/** AI 工作流默认步骤 */
export const WORKFLOW_STEPS: WorkflowStep[] = [
  { role: 'ae', name: 'AE 需求整理', description: '把客户口述转成标准 brief', icon: '📋' },
  { role: 'strategy', name: '策略判断', description: '行业、客群、风格与预算', icon: '🎯' },
  { role: 'creative', name: '创意方向', description: '生成 3 条可执行路线', icon: '💡' },
  { role: 'visual', name: '视觉生成', description: 'GPT-image-2 异步生图', icon: '🎨' },
  { role: 'compose', name: '环境合成', description: '套入门头或墙体照片', icon: '🖼️' },
  { role: 'output', name: '工厂输出', description: '效果图、SVG、施工说明', icon: '📦' },
]

/** API 响应通用格式 */
export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

/** 分页响应 */
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
