// ============================================
// 效果图编辑器 - 类型定义
// ============================================
import type { fabric } from 'fabric'

/** 画布图层 */
export interface CanvasLayer {
  id: string
  type: 'text' | 'image' | 'rect'
  name: string
  /** 文字内容 or 图片 URL */
  content: string
  x: number
  y: number
  width: number
  height: number
  angle: number
  scaleX: number
  scaleY: number
  /** 颜色 / 填充 */
  fill: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: string
  opacity: number
  visible: boolean
  locked: boolean
  /** 材质描述 */
  material?: string
  /** 图片图层亮度（-1 ~ 1） */
  brightness?: number
  /** 图片图层对比度（-1 ~ 1） */
  contrast?: number
}

/** Fabric 画布对外暴露的控制器 */
export interface FabricController {
  /** 新增文字图层 */
  addText: (opts?: Partial<CanvasLayer>) => void
  /** 新增图片图层（AI 生成效果图 / 环境图） */
  addImage: (url: string, opts?: Partial<CanvasLayer>) => void
  /** 新增矩形底板图层 */
  addRect: (opts?: Partial<CanvasLayer>) => void
  /** 更新当前选中图层 */
  updateSelected: (patch: Partial<CanvasLayer>) => void
  /** 更新当前图片图层的亮度/对比度滤镜 */
  updateImageFilter: (patch: { brightness?: number; contrast?: number }) => void
  /** 删除当前选中图层 */
  removeSelected: () => void
  /** 复制当前选中图层 */
  duplicateSelected: () => void
  /** 上移一层 */
  bringForward: () => void
  /** 下移一层 */
  sendBackward: () => void
  /** 撤销 */
  undo: () => void
  /** 重做 */
  redo: () => void
  /** 导出为 JSON（保存项目版本） */
  exportJSON: () => Record<string, unknown>
  /** 导出为 PNG（客户效果图） */
  exportPNG: () => string
  /** 导出为 SVG（矢量交付） */
  exportSVG: () => string
  /** 设置背景环境图 */
  setBackgroundImage: (url: string) => void
  /** 获取当前选中图层数据 */
  getSelectedLayer: () => CanvasLayer | null
  /** 获取底层 fabric.Canvas 实例（供导出工具使用） */
  getCanvas: () => fabric.Canvas | null
}

/** FabricCanvas 组件命令式句柄（与 FabricController 一致） */
export type FabricCanvasHandle = FabricController

/** 导出格式 */
export type ExportFormat = 'png' | 'svg' | 'json' | 'pdf'

/** 预设颜色（广告常用色） */
export interface PresetColor {
  name: string
  value: string
}

export const PRESET_COLORS: PresetColor[] = [
  { name: '白', value: '#ffffff' },
  { name: '暖白', value: '#fff4e0' },
  { name: '黑', value: '#111418' },
  { name: '金', value: '#f7b955' },
  { name: '蓝', value: '#4aa8ff' },
  { name: '科技蓝', value: '#2f6bff' },
  { name: '红', value: '#ff4d4f' },
  { name: '橙', value: '#ff8c42' },
  { name: '绿', value: '#34d399' },
  { name: '紫', value: '#a78bfa' },
  { name: '银', value: '#c0c4cc' },
  { name: '玫瑰金', value: '#e6b8a2' },
]

/** 预设材质 */
export interface MaterialOption {
  id: string
  name: string
  desc: string
  /** 建议默认填充色 */
  fill: string
}

export const MATERIAL_OPTIONS: MaterialOption[] = [
  {
    id: 'acrylic_warm',
    name: '黑色亚克力发光字 + 暖白背光',
    desc: '黑底板亚克力字，内置暖白 LED 灯带，质感高档、氛围柔和',
    fill: '#fff4e0',
  },
  {
    id: 'steel_brushed',
    name: '不锈钢字（拉丝）',
    desc: '304 拉丝不锈钢立体字，金属质感强，适合现代门店',
    fill: '#c0c4cc',
  },
  {
    id: 'steel_mirror',
    name: '不锈钢字（镜面）',
    desc: '镜面抛光不锈钢，反光强烈、视觉通透',
    fill: '#e8edf2',
  },
  {
    id: 'pvc',
    name: 'PVC 字',
    desc: '经济实惠的 PVC 发泡字，适合短期活动与临时门头',
    fill: '#ffffff',
  },
  {
    id: 'resin',
    name: '树脂字（通体发光）',
    desc: '环氧树脂浇筑，通体均匀发光，字边圆润无暗区',
    fill: '#ffd98a',
  },
  {
    id: 'mini',
    name: '迷你字',
    desc: '亚克力正反两面粘接，小巧精致，高端零售常用',
    fill: '#f7b955',
  },
  {
    id: 'perforated',
    name: '冲孔字（外露灯珠）',
    desc: '铁皮冲孔 + 外露 LED 灯珠，远距离醒目、亮眼',
    fill: '#4aa8ff',
  },
  {
    id: 'acrylic_edge',
    name: '亚克力无边字',
    desc: '无外露边条亚克力字，简洁平整，适合极简风格',
    fill: '#ffffff',
  },
  {
    id: 'spray_lightbox',
    name: '喷绘布 + 灯箱',
    desc: '户外喷绘布画面 + 内置灯箱，成本低、画面鲜艳',
    fill: '#ffd98a',
  },
  {
    id: 'soft_film',
    name: '软膜灯箱',
    desc: 'UV 软膜灯箱，画面无拼接、透光均匀通透',
    fill: '#e8edf2',
  },
  {
    id: '3m_film',
    name: '3M 贴膜字',
    desc: '3M 贴膜裁切字，室外耐候、色彩持久不易褪色',
    fill: '#4aa8ff',
  },
  {
    id: 'aluminum_wave',
    name: '铝方通 / 波浪板底板',
    desc: '铝方通或波浪板底板，现代金属质感、立体背景',
    fill: '#c0c4cc',
  },
]
