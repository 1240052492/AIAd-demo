import { useRef, useState } from 'react'
import { Upload, ImagePlus, Sparkles, Download, Type, RefreshCw } from 'lucide-react'
import { cn } from '@/utils/cn'
import { ExportPanel } from '@/components/editor/ExportPanel'
import type { ExportFormat } from '@/components/editor/types'

export interface AssetItem {
  id: string
  url: string
  title: string
}

export interface AssetPanelProps {
  backgroundUrl: string
  onBackgroundChange: (url: string) => void
  onAddText: () => void
  onAddImage: (url: string) => void
  envImages: AssetItem[]
  aiImages: AssetItem[]
  jobStatus: string
  creditsFrozen: number
  onExport: (format: ExportFormat) => void
}

type TabKey = 'design' | 'environment' | 'export'

const TABS: { key: TabKey; label: string; icon: typeof Sparkles }[] = [
  { key: 'design', label: '广告原图', icon: Sparkles },
  { key: 'environment', label: '环境图', icon: ImagePlus },
  { key: 'export', label: '导出', icon: Download },
]

export function AssetPanel({
  backgroundUrl,
  onBackgroundChange,
  onAddText,
  onAddImage,
  envImages,
  aiImages,
  jobStatus,
  creditsFrozen,
  onExport,
}: AssetPanelProps) {
  const [tab, setTab] = useState<TabKey>('design')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') onBackgroundChange(reader.result)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const jobLabel =
    jobStatus === 'processing'
      ? '生成中…'
      : jobStatus === 'succeeded'
        ? '已完成'
        : jobStatus === 'failed'
          ? '失败（积分已退回）'
          : '待生成'

  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col border-r border-border bg-panel">
      {/* Tab 头 */}
      <div className="flex items-stretch border-b border-border">
        {TABS.map((t) => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2.5 text-[12px] font-medium transition-colors',
                active
                  ? 'border-blue text-text'
                  : 'border-transparent text-muted hover:text-text',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          )
        })}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {/* ===== Tab 1：广告原图 ===== */}
        {tab === 'design' && (
          <>
            <section>
              <div className="mb-2 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber" />
                <span className="text-[12px] font-medium text-muted">AI 方案图</span>
              </div>
              {aiImages.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {aiImages.map((img) => (
                    <button
                      key={img.id}
                      type="button"
                      title={`点击添加：${img.title}`}
                      onClick={() => onAddImage(img.url)}
                      className="group relative aspect-[3/4] overflow-hidden rounded-btn border border-border bg-panel-2 hover:border-blue"
                    >
                      <img
                        src={img.url}
                        alt={img.title}
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                      <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-1.5 py-1 text-[10px] text-white">
                        {img.title}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-btn border border-dashed border-border px-3 py-6 text-center text-[12px] text-muted">
                  暂无方案图
                  <br />
                  生成后将自动出现在这里
                </div>
              )}
            </section>

            {/* 生成任务状态 */}
            <section>
              <div className="mb-2 flex items-center gap-1.5">
                <RefreshCw
                  className={cn(
                    'h-3.5 w-3.5',
                    jobStatus === 'processing' ? 'animate-spin text-amber' : 'text-green',
                  )}
                />
                <span className="text-[12px] font-medium text-muted">生成任务状态</span>
              </div>
              <div className="rounded-md border border-border bg-white/[0.02] px-2.5 py-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted">当前状态</span>
                  <span
                    className={cn(
                      'font-medium',
                      jobStatus === 'processing'
                        ? 'text-amber'
                        : jobStatus === 'succeeded'
                          ? 'text-green'
                          : 'text-muted',
                    )}
                  >
                    {jobLabel}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <span className="text-muted">冻结积分</span>
                  <span className="font-medium text-text">{creditsFrozen}</span>
                </div>
              </div>
            </section>

            <p className="text-[11px] leading-snug text-muted">
              点击方案图即可一键添加到中间画布，手动套入门头环境。
            </p>
          </>
        )}

        {/* ===== Tab 2：环境图 ===== */}
        {tab === 'environment' && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px] font-medium text-muted">门店环境图</span>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1 rounded-pill bg-white/5 px-2 py-1 text-[11px] text-muted hover:bg-white/10"
              >
                <Upload className="h-3 w-3" /> 上传
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleUpload}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="group relative block aspect-[4/3] w-full overflow-hidden rounded-btn border border-border bg-panel-2"
            >
              {backgroundUrl ? (
                <img
                  src={backgroundUrl}
                  alt="环境图"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted">
                  <ImagePlus className="h-5 w-5" />
                  <span className="text-[11px]">上传环境图</span>
                </span>
              )}
            </button>
            {envImages.length > 0 && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {envImages.map((img) => (
                  <button
                    key={img.id}
                    type="button"
                    title={img.title}
                    onClick={() => onBackgroundChange(img.url)}
                    className={cn(
                      'aspect-square overflow-hidden rounded-md border',
                      backgroundUrl === img.url
                        ? 'border-blue'
                        : 'border-border hover:border-white/30',
                    )}
                  >
                    <img
                      src={img.url}
                      alt={img.title}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
            <p className="mt-3 text-[11px] leading-snug text-muted">
              环境图作为中间画布的真实背景，套入 AI 方案图后即可预览交付效果。
            </p>
          </section>
        )}

        {/* ===== Tab 3：导出 ===== */}
        {tab === 'export' && (
          <section>
            <div className="mb-2 flex items-center gap-1.5">
              <Download className="h-3.5 w-3.5 text-blue" />
              <span className="text-[12px] font-medium text-muted">交付文件</span>
            </div>
            <ExportPanel onExport={onExport} />
            <p className="mt-3 text-[11px] leading-snug text-muted">
              导出前请先在中间画布中排好门头效果图，PNG 为客户交付图、SVG 为矢量、JSON 为可再编辑源文件。
            </p>
          </section>
        )}
      </div>

      {/* 底部快捷添加发光字 */}
      <div className="border-t border-border p-3">
        <button
          type="button"
          onClick={onAddText}
          className="flex w-full items-center justify-center gap-2 rounded-btn bg-white/5 py-2 text-[13px] font-medium text-text hover:bg-white/10"
        >
          <Type className="h-4 w-4" />
          添加发光字图层
        </button>
      </div>
    </aside>
  )
}
