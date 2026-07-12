// ============================================
// useEditor - 编辑器状态与操作编排
// 管理：项目数据、素材列表（真实后端）、选中图层、保存、导出、添加图层
// ============================================
import { useCallback, useRef, useState, useEffect, type RefObject } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { FabricCanvasHandle } from '@/components/editor/types'
import type { CanvasLayer, ExportFormat } from '@/components/editor/types'
import type { AssetItem } from '@/components/editor/AssetPanel'
import { projectApi, creditApi, imageJobApi } from '@/services/api'
import type { Project } from '@/types'
import { exportToPNG, exportToSVG } from '@/utils/exportCanvas'

export const CANVAS_W = 610
export const CANVAS_H = 780

/** 生成占位 SVG 图（无环境图时的默认画布背景） */
function svgDataUrl(
  bg: string,
  accent: string,
  label: string,
  w = 480,
  h = 600,
): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>
    <rect width='${w}' height='${h}' fill='${bg}'/>
    <rect x='${w * 0.12}' y='${h * 0.1}' width='${w * 0.76}' height='${h * 0.8}' rx='10' fill='${accent}' opacity='0.18'/>
    <rect x='${w * 0.12}' y='${h * 0.1}' width='${w * 0.76}' height='${h * 0.8}' rx='10' fill='none' stroke='${accent}' stroke-width='3' opacity='0.6'/>
    <text x='50%' y='52%' fill='${accent}' font-family='Microsoft YaHei, sans-serif' font-size='${Math.round(w * 0.06)}' font-weight='bold' text-anchor='middle'>${label}</text>
  </svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/** 触发浏览器下载 dataURL */
function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** 触发浏览器下载文本（JSON / SVG） */
function downloadText(text: string, filename: string, mime: string) {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  downloadDataUrl(url, filename)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export interface UseEditorResult {
  /** FabricCanvas 命令式句柄 */
  fabricRef: RefObject<FabricCanvasHandle>
  /** 项目详情（可能为 null，未加载时回退占位） */
  project: Project | null
  /** 项目标题（回退占位） */
  projectTitle: string
  /** 冻结积分（来自真实积分账户） */
  frozenCredits: number
  /** 当前选中图层 */
  selected: CanvasLayer | null
  setSelected: (layer: CanvasLayer | null) => void
  /** 当前环境图 URL */
  backgroundUrl: string
  setBackgroundUrl: (url: string) => void
  /** 保存中状态 */
  saving: boolean
  /** 轻量提示 */
  toast: { msg: string; type: 'ok' | 'info' } | null
  showToast: (msg: string, type?: 'ok' | 'info') => void
  /** 环境图缩略图（真实后端素材） */
  envImages: AssetItem[]
  /** AI 方案图（真实后端素材） */
  aiImages: AssetItem[]
  /** 生成任务状态（processing / succeeded / failed） */
  jobStatus: string
  /** 初始发光字图层 */
  initialLayers: CanvasLayer[]
  // ---- 操作 ----
  addText: () => void
  addImage: (url: string) => void
  onChange: (patch: Partial<CanvasLayer>) => void
  onImageFilterChange: (patch: { brightness?: number; contrast?: number }) => void
  onExport: (format: ExportFormat) => void
  onSave: () => void
  undo: () => void
  redo: () => void
  removeSelected: () => void
  duplicateSelected: () => void
  bringForward: () => void
  sendBackward: () => void
}

export function useEditor(projectId: string, jobId?: string): UseEditorResult {
  const fabricRef = useRef<FabricCanvasHandle>(null)
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<CanvasLayer | null>(null)
  const [backgroundUrl, setBackgroundUrl] = useState<string>(() =>
    svgDataUrl('#10151c', '#4aa8ff', '门店环境', CANVAS_W, CANVAS_H),
  )
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'info' } | null>(null)
  const [envImages, setEnvImages] = useState<AssetItem[]>([])
  const [aiImages, setAiImages] = useState<AssetItem[]>([])
  const [jobStatus, setJobStatus] = useState<string>(jobId ? 'processing' : 'pending')
  const [frozenCredits, setFrozenCredits] = useState<number>(0)

  /** 标记用户是否已手动选择背景，避免自动回填覆盖用户选择 */
  const bgUserSet = useRef(false)
  const handleBgChange = useCallback((url: string) => {
    bgUserSet.current = true
    setBackgroundUrl(url)
  }, [])

  const showToast = useCallback((msg: string, type: 'ok' | 'info' = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2200)
  }, [])

  // 项目详情查询
  const { data: project } = useQuery({
    queryKey: ['editor-project', projectId],
    queryFn: () => projectApi.detail(projectId).then((r) => r.data),
    enabled: !!projectId,
  })

  // 真实素材列表（环境图 / AI 生成图）
  const { data: assets } = useQuery({
    queryKey: ['editor-assets', projectId],
    queryFn: () => projectApi.getAssets(projectId).then((r) => r.data),
    enabled: !!projectId,
  })

  // 积分账户余额（取冻结额）
  const { data: credit } = useQuery({
    queryKey: ['editor-credits'],
    queryFn: () => creditApi.balance().then((r) => r.data),
  })

  // 把后端资产映射为面板素材项
  useEffect(() => {
    if (!assets) return
    const env = assets
      .filter((a) => a.type === 'upload_environment')
      .map((a, i) => ({ id: a.id, url: a.url, title: `环境图 ${i + 1}` }))
    const ai = assets
      .filter((a) => a.type === 'generated_design')
      .map((a, i) => ({ id: a.id, url: a.url, title: `AI 方案 ${i + 1}` }))
    setEnvImages(env)
    setAiImages(ai)
    // 用户未手动选背景时，默认用第一张环境图
    if (!bgUserSet.current && env.length > 0) {
      setBackgroundUrl(env[0].url)
    }
  }, [assets])

  // 同步冻结积分
  useEffect(() => {
    if (credit) setFrozenCredits(credit.frozenBalance)
  }, [credit])

  // 轮询生图任务：完成后刷新素材与积分
  useEffect(() => {
    if (!jobId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      try {
        const job = await imageJobApi.getStatus(jobId)
        const st = job.data.status
        if (cancelled) return
        setJobStatus(
          st === 'succeeded'
            ? 'succeeded'
            : st === 'failed' || st === 'canceled'
              ? 'failed'
              : 'processing',
        )
        if (st === 'succeeded' || st === 'failed' || st === 'canceled') {
          queryClient.invalidateQueries({ queryKey: ['editor-assets', projectId] })
          queryClient.invalidateQueries({ queryKey: ['editor-credits'] })
          if (st === 'succeeded') showToast('生图完成，已加入素材库', 'ok')
          else showToast('生图任务失败（积分已退回）', 'info')
          return
        }
        timer = setTimeout(tick, 3000)
      } catch {
        if (!cancelled) setJobStatus('failed')
      }
    }
    tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [jobId, projectId, queryClient, showToast])

  const projectTitle = project?.title ?? '未命名项目'

  // 初始发光字图层（示例模板）
  const initialLayers: CanvasLayer[] = [
    {
      id: 'layer-title',
      type: 'text',
      name: '店名发光字',
      content: '不晚 · STUDIO',
      x: CANVAS_W / 2,
      y: CANVAS_H * 0.32,
      width: 460,
      height: 90,
      angle: 0,
      scaleX: 1,
      scaleY: 1,
      fill: '#fff4e0',
      fontFamily: 'Microsoft YaHei',
      fontSize: 72,
      fontWeight: 'bold',
      opacity: 1,
      visible: true,
      locked: false,
      material: '黑色亚克力发光字 + 暖白背光',
    },
    {
      id: 'layer-sub',
      type: 'text',
      name: '英文副标',
      content: 'LATE NIGHT · STUDIO',
      x: CANVAS_W / 2,
      y: CANVAS_H * 0.42,
      width: 420,
      height: 30,
      angle: 0,
      scaleX: 1,
      scaleY: 1,
      fill: '#4aa8ff',
      fontFamily: 'Microsoft YaHei',
      fontSize: 26,
      fontWeight: '500',
      opacity: 1,
      visible: true,
      locked: false,
    },
  ]

  const addText = useCallback(() => {
    fabricRef.current?.addText({
      content: '新发光字',
      name: '发光字',
      fill: '#ffffff',
      fontSize: 56,
    })
  }, [])

  const addImage = useCallback((url: string) => {
    fabricRef.current?.addImage(url, { name: 'AI 效果图' })
  }, [])

  const onChange = useCallback((patch: Partial<CanvasLayer>) => {
    fabricRef.current?.updateSelected(patch)
  }, [])

  const onImageFilterChange = useCallback(
    (patch: { brightness?: number; contrast?: number }) => {
      fabricRef.current?.updateImageFilter(patch)
    },
    [],
  )

  const onExport = useCallback(
    (format: ExportFormat) => {
      const ctrl = fabricRef.current
      if (!ctrl) return
      if (format === 'png') {
        const canvas = ctrl.getCanvas()
        if (!canvas) return
        downloadDataUrl(exportToPNG(canvas), '门头效果图.png')
        showToast('已导出客户效果图 PNG', 'ok')
      } else if (format === 'svg') {
        const canvas = ctrl.getCanvas()
        if (!canvas) return
        downloadText(exportToSVG(canvas), '门头效果图.svg', 'image/svg+xml')
        showToast('已导出矢量 SVG', 'ok')
      } else if (format === 'json') {
        downloadText(
          JSON.stringify(ctrl.exportJSON(), null, 2),
          '项目源文件.json',
          'application/json',
        )
        showToast('已导出项目源文件 JSON（可再次编辑）', 'ok')
      } else if (format === 'pdf') {
        const canvas = ctrl.getCanvas()
        if (!canvas) return
        downloadDataUrl(exportToPNG(canvas), '工厂施工参考.png')
        showToast('PDF 施工参考为初版，已导出 PNG 占位', 'info')
      }
    },
    [showToast],
  )

  const onSave = useCallback(() => {
    const ctrl = fabricRef.current
    if (!ctrl) return
    setSaving(true)
    const json = ctrl.exportJSON()
    try {
      localStorage.setItem('adcraft:editor:last', JSON.stringify(json))
      showToast('项目已保存（本地快照）', 'ok')
    } finally {
      setTimeout(() => setSaving(false), 600)
    }
  }, [showToast])

  const undo = useCallback(() => fabricRef.current?.undo(), [])
  const redo = useCallback(() => fabricRef.current?.redo(), [])
  const removeSelected = useCallback(() => fabricRef.current?.removeSelected(), [])
  const duplicateSelected = useCallback(
    () => fabricRef.current?.duplicateSelected(),
    [],
  )
  const bringForward = useCallback(() => fabricRef.current?.bringForward(), [])
  const sendBackward = useCallback(() => fabricRef.current?.sendBackward(), [])

  return {
    fabricRef,
    project: project ?? null,
    projectTitle,
    frozenCredits,
    selected,
    setSelected,
    backgroundUrl,
    setBackgroundUrl: handleBgChange,
    saving,
    toast,
    showToast,
    envImages,
    aiImages,
    jobStatus,
    initialLayers,
    addText,
    addImage,
    onChange,
    onImageFilterChange,
    onExport,
    onSave,
    undo,
    redo,
    removeSelected,
    duplicateSelected,
    bringForward,
    sendBackward,
  }
}
