import { useEffect, useRef, useState } from 'react'
import { useParams, useLocation, useSearchParams } from 'react-router-dom'
import {
  Undo2,
  Redo2,
  MousePointer2,
  ZoomIn,
  Square,
  ArrowUpRight,
  Type,
  Trash2,
  RefreshCw,
  Loader2,
} from 'lucide-react'
import { FabricCanvas, type FabricCanvasProps } from '@/components/editor/FabricCanvas'
import { AssetPanel } from '@/components/editor/AssetPanel'
import { PropertyPanel } from '@/components/editor/PropertyPanel'
import { EditorTopbar } from '@/components/editor/EditorTopbar'
import type { CanvasLayer } from '@/components/editor/types'
import { useEditor } from '@/hooks/useEditor'
import { useAnnotations } from '@/hooks/useAnnotations'
import { editorApi } from '@/services/editor.api'
import { cn } from '@/utils/cn'

/** 生成兜底占位图（mock 没返回 URL 时也能完成「加载到画布」的闭环） */
function fallbackImage(prompt: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='610' height='780' viewBox='0 0 610 780'><rect width='610' height='780' fill='#0f1620'/><rect x='40' y='40' width='530' height='700' rx='16' fill='none' stroke='#4aa8ff' stroke-width='4' stroke-dasharray='12 8'/><text x='305' y='370' text-anchor='middle' fill='#4aa8ff' font-family='Microsoft YaHei,sans-serif' font-size='26' font-weight='bold'>已按批注重新生成</text><text x='305' y='410' text-anchor='middle' fill='#9aa6b2' font-family='Microsoft YaHei,sans-serif' font-size='16'>${prompt.slice(0, 40).replace(/[<>&]/g, '')}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export default function EditorPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const location = useLocation()
  const state = (location.state ?? null) as { jobId?: string } | null
  const [params] = useSearchParams()

  // ===== 携带参数契约（来自首页工作台）=====
  const seedImg = params.get('seedImg') ?? ''
  const polishPrompt = params.get('polishPrompt') ?? ''

  const [promptText, setPromptText] = useState<string>(() => polishPrompt)
  const [busy, setBusy] = useState(false)
  const initialPromptRef = useRef(polishPrompt.trim())
  const seedLoaded = useRef(false)

  const {
    fabricRef,
    projectTitle,
    frozenCredits,
    selected,
    setSelected,
    backgroundUrl,
    setBackgroundUrl,
    saving,
    toast,
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
  } = useEditor(projectId ?? '', state?.jobId)

  // ===== 标注工具（移植 AIhuabu 标注画布逻辑）=====
  const { activeTool, setActiveTool, annotations, clearAnnotations } = useAnnotations(fabricRef)

  // 携带基础图：作为可编辑图层加载到画布（而非只读背景）
  useEffect(() => {
    if (!seedImg || seedLoaded.current) return
    const ctrl = fabricRef.current
    if (!ctrl) return
    seedLoaded.current = true
    ctrl.addImage(seedImg, { name: '原图（待修改）', width: 560 })
  }, [seedImg, fabricRef])

  const handleLayerSelect: FabricCanvasProps['onLayerSelect'] = (layer) => {
    setSelected(layer as CanvasLayer | null)
  }

  // ===== 重新生成（门控：必须至少有 1 条标注批注）=====
  async function handleRegenerate() {
    const promptChanged = promptText.trim() !== initialPromptRef.current
    // 门控：未修改提示词且未添加任何修改建议时直接拦截（按钮同时 disabled）
    if (!promptChanged && annotations.length === 0) {
      return
    }
    setBusy(true)
    try {
      const { imageUrl } = await editorApi.regenerate({
        prompt: promptText,
        annotations,
        seedImg: seedImg || undefined,
        mock: false,
      })
      const url = imageUrl || fallbackImage(promptText)
      fabricRef.current?.addImage(url, { name: '重新生成结果', width: 560 })
      // 新一轮迭代：清空批注，迫使下次再生前再次给出修改建议
      clearAnnotations()
      toastFn('已根据批注重新生成，可继续修改', 'ok')
    } catch (err) {
      toastFn(err instanceof Error ? err.message : '重新生成失败', 'info')
    } finally {
      setBusy(false)
    }
  }

  // useEditor 的 toast 仅在保存/导出等内置动作触发；
  // 重新生成用本地轻量 toast 提示。
  const [localToast, setLocalToast] = useState<{ msg: string; type: 'ok' | 'info' } | null>(null)
  function toastFn(msg: string, type: 'ok' | 'info') {
    setLocalToast({ msg, type })
  }
  useEffect(() => {
    if (!localToast) return
    const t = setTimeout(() => setLocalToast(null), 2200)
    return () => clearTimeout(t)
  }, [localToast])

  const toolButtons: Array<{ tool: 'select' | 'rect' | 'arrow' | 'text'; label: string; icon: JSX.Element }> = [
    { tool: 'select', label: '选择/移动', icon: <MousePointer2 className="h-4 w-4" /> },
    { tool: 'rect', label: '框选区域', icon: <Square className="h-4 w-4" /> },
    { tool: 'arrow', label: '箭头', icon: <ArrowUpRight className="h-4 w-4" /> },
    { tool: 'text', label: '文字批注', icon: <Type className="h-4 w-4" /> },
  ]

  const promptChanged = promptText.trim() !== initialPromptRef.current
  const gateBlocked = !promptChanged && annotations.length === 0

  return (
    <div className="flex h-screen flex-col bg-bg text-text">
      <EditorTopbar
        projectTitle={projectTitle}
        subtitle={seedImg ? '携带图 · AI 润色修改' : '门头发光字'}
        frozenCredits={frozenCredits}
        onSave={onSave}
        onExport={() => onExport('png')}
        saving={saving}
      />

      <div className="flex min-h-0 flex-1">
        <AssetPanel
          backgroundUrl={backgroundUrl}
          onBackgroundChange={setBackgroundUrl}
          onAddText={addText}
          onAddImage={addImage}
          envImages={envImages}
          aiImages={aiImages}
          jobStatus={jobStatus}
          creditsFrozen={frozenCredits}
          onExport={onExport}
        />

        {/* 中间画布区域 */}
        <main className="relative flex min-w-0 flex-1 flex-col bg-bg">
          {/* 工具栏 */}
          <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
            <button
              type="button"
              onClick={undo}
              className="flex h-8 w-8 items-center justify-center rounded-btn border border-border bg-white/[0.02] text-muted hover:bg-white/[0.06]"
              title="撤销"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={redo}
              className="flex h-8 w-8 items-center justify-center rounded-btn border border-border bg-white/[0.02] text-muted hover:bg-white/[0.06]"
              title="重做"
            >
              <Redo2 className="h-4 w-4" />
            </button>

            <div className="mx-1 h-5 w-px bg-border" />

            {/* 标注工具（移植 AIhuabu） */}
            {toolButtons.map((b) => (
              <button
                key={b.tool}
                type="button"
                onClick={() => setActiveTool(b.tool)}
                title={b.label}
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-btn border px-2 text-[12px]',
                  activeTool === b.tool
                    ? 'border-blue/70 bg-blue/15 text-text'
                    : 'border-border bg-white/[0.02] text-muted hover:bg-white/[0.06]',
                )}
              >
                {b.icon}
                {b.label}
              </button>
            ))}
            <button
              type="button"
              onClick={clearAnnotations}
              disabled={annotations.length === 0}
              title="清除全部批注"
              className="flex h-8 items-center gap-1.5 rounded-btn border border-border bg-white/[0.02] px-2 text-[12px] text-muted hover:bg-white/[0.06] disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" />
              清除批注
            </button>

            <div className="ml-2 flex items-center gap-1.5 text-[12px] text-muted">
              <MousePointer2 className="h-3.5 w-3.5" />
              标注 {annotations.length} 条
            </div>
            <div className="ml-auto flex items-center gap-1.5 text-[12px] text-muted">
              <ZoomIn className="h-3.5 w-3.5" />
              门头画布 610 × 780
            </div>
          </div>

          {/* 网格画布区 */}
          <div
            className="flex flex-1 items-center justify-center overflow-auto p-8"
            style={{
              backgroundColor: '#0a0c0f',
              backgroundImage:
                'linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
            }}
          >
            <div className="rounded-xl p-3 ring-1 ring-white/10 bg-black/30">
              <FabricCanvas
                ref={fabricRef}
                width={610}
                height={780}
                backgroundImageUrl={backgroundUrl}
                initialLayers={seedImg ? [] : initialLayers}
                onLayerSelect={handleLayerSelect}
              />
            </div>
          </div>

          {/* 底部：AI 润色提示词 + 重新生成（门控） */}
          <div className="shrink-0 border-t border-border bg-bg/80 p-3">
            <div className="flex items-start gap-3">
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-[12px] font-semibold text-muted">AI 润色提示词</span>
                <textarea
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  placeholder="描述你想要的修改，例如：把背景换成海边日落 / 把店名放大"
                  className="min-h-[60px] w-full resize-y rounded-card border border-border bg-bg/70 p-2.5 text-[13px] leading-relaxed outline-none focus:border-blue/70"
                />
              </label>
              <div className="flex flex-col items-stretch gap-2 pt-6">
                <button
                  type="button"
                  onClick={handleRegenerate}
                  disabled={gateBlocked || busy}
                  title={gateBlocked ? '请先修改提示词，或添加至少一处修改批注' : '根据提示词和批注重新生成'}
                  className={cn(
                    'flex h-10 min-w-[140px] items-center justify-center gap-2 rounded-btn px-4 text-[13px] font-semibold transition',
                    gateBlocked
                      ? 'cursor-not-allowed border border-border bg-white/[0.02] text-muted/60'
                      : 'bg-blue text-white hover:bg-blue/85',
                    busy && 'opacity-70',
                  )}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  重新生成
                </button>
              </div>
            </div>
            {gateBlocked ? (
              <p className="mt-2 text-[12px] text-amber">
                请先修改提示词，或用上方「框选区域 / 箭头 / 文字批注」工具在图上给出至少一处修改建议，才能重新生成。
              </p>
            ) : (
              <p className="mt-2 text-[12px] text-muted">
                {promptChanged ? '提示词已修改' : `已添加 ${annotations.length} 处修改批注`}，点击「重新生成」将连同提示词和批注一起发送给生图接口。
              </p>
            )}
          </div>
        </main>

        <PropertyPanel
          selected={selected}
          canvasSize={{ width: 610, height: 780 }}
          onChange={onChange}
          onImageFilterChange={onImageFilterChange}
          onRemove={removeSelected}
          onDuplicate={duplicateSelected}
          onBringForward={bringForward}
          onSendBackward={sendBackward}
        />
      </div>

      {/* 轻量提示 */}
      {(toast || localToast) && (
        <div
          className={cn(
            'fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-btn px-4 py-2 text-[13px] shadow-lg',
            (toast?.type ?? localToast?.type) === 'ok'
              ? 'bg-green/20 text-green ring-1 ring-green/40'
              : 'bg-amber/20 text-amber ring-1 ring-amber/40',
          )}
        >
          {toast?.msg ?? localToast?.msg}
        </div>
      )}
    </div>
  )
}
