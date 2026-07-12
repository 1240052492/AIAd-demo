import { useParams, useLocation } from 'react-router-dom'
import { Undo2, Redo2, MousePointer2, ZoomIn } from 'lucide-react'
import { FabricCanvas, type FabricCanvasProps } from '@/components/editor/FabricCanvas'
import { AssetPanel } from '@/components/editor/AssetPanel'
import { PropertyPanel } from '@/components/editor/PropertyPanel'
import { EditorTopbar } from '@/components/editor/EditorTopbar'
import type { CanvasLayer } from '@/components/editor/types'
import { useEditor } from '@/hooks/useEditor'
import { cn } from '@/utils/cn'

export default function EditorPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const location = useLocation()
  const state = (location.state ?? null) as { jobId?: string } | null

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

  const handleLayerSelect: FabricCanvasProps['onLayerSelect'] = (layer) => {
    setSelected(layer as CanvasLayer | null)
  }

  return (
    <div className="flex h-screen flex-col bg-bg text-text">
      <EditorTopbar
        projectTitle={projectTitle}
        subtitle="门头发光字"
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
            <div className="ml-2 flex items-center gap-1.5 text-[12px] text-muted">
              <MousePointer2 className="h-3.5 w-3.5" />
              点击图层进行选择 / 拖拽 / 缩放
            </div>
            <div className="ml-auto flex items-center gap-1.5 text-[12px] text-muted">
              <ZoomIn className="h-3.5 w-3.5" />
              门头画布 {610} × {780}
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
                initialLayers={initialLayers}
                onLayerSelect={handleLayerSelect}
              />
            </div>
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
      {toast && (
        <div
          className={cn(
            'fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-btn px-4 py-2 text-[13px] shadow-lg',
            toast.type === 'ok'
              ? 'bg-green/20 text-green ring-1 ring-green/40'
              : 'bg-amber/20 text-amber ring-1 ring-amber/40',
          )}
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}
