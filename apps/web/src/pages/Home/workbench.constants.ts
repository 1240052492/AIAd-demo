export const BUSINESS_TYPES = [
  { id: 'storefront_sign', title: '门头招牌', desc: '发光字、底板、灯箱' },
  { id: 'culture_wall', title: '墙体文化', desc: '文化墙、展板、美陈' },
  { id: 'ad_material', title: '广告物料', desc: '海报、喷绘、易拉宝' },
  { id: 'brand_vi', title: '品牌 VI', desc: 'Logo、辅助图形、物料' },
  { id: 'construction', title: '施工输出', desc: '尺寸、材质、安装说明' },
]

export const IMAGE_SIZE_PRESETS = [
  { value: '16:9', label: '横版', detail: '1365x768' },
  { value: '9:16', label: '竖版', detail: '768x1365' },
  { value: '1:1', label: '方图', detail: '1024x1024' },
  { value: '4:3', label: '标准横版', detail: '1024x768' },
  { value: '3:4', label: '标准竖版', detail: '768x1024' },
]

export const IMAGE_QUALITY_OPTIONS = [
  { value: 'high', label: '高质量' },
  { value: 'medium', label: '标准质量' },
  { value: 'low', label: '快速草图' },
]

export const DEFAULT_NEED =
  '给一家服装工作室设计门头，店名“不晚 STUDIO”，白色墙面，黑色发光字，风格高级、干净，适合夜间亮灯展示。'

export const DEFAULT_MATERIAL = '门头招牌'
export const DEFAULT_STYLE = '现代'

/** 预留给用户自定义的「其他」选项值（材质 / 风格下拉通用） */
export const OTHERS_VALUE = '其他'

/** 材质下拉选项（广告行业常见物料分类） */
export const MATERIAL_OPTIONS = [
  { value: '门头招牌', label: '门头招牌' },
  { value: '文化墙', label: '文化墙' },
  { value: '海报', label: '海报' },
  { value: 'LOGO', label: 'LOGO' },
  { value: '电商主图', label: '电商主图' },
  { value: '灯箱', label: '灯箱' },
  { value: '喷绘', label: '喷绘' },
  { value: '易拉宝', label: '易拉宝' },
  { value: OTHERS_VALUE, label: '其他（自定义）' },
]

/** 风格下拉选项 */
export const STYLE_OPTIONS = [
  { value: '现代', label: '现代' },
  { value: '国潮', label: '国潮' },
  { value: '极简', label: '极简' },
  { value: '复古', label: '复古' },
  { value: '商务', label: '商务' },
  { value: '赛博朋克', label: '赛博朋克' },
  { value: '手绘', label: '手绘' },
  { value: '3D', label: '3D 卡通' },
  { value: OTHERS_VALUE, label: '其他（自定义）' },
]

/** 生图模型选项。gpt-image-2 为当前激活；banana2 / Gork 为预留（UI 禁用） */
export const MODEL_OPTIONS = [
  { code: 'gpt-image-2', name: 'GPT Image 2 (默认)' },
  { code: 'banana2', name: 'Banana2 (预留)', reserved: true },
  { code: 'Gork', name: 'Gork (预留)', reserved: true },
]
