import { Download, FileImage, FileType2, FileJson, FileText } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { ExportFormat } from '@/components/editor/types'

export interface ExportPanelProps {
  onExport: (format: ExportFormat) => void
  busy?: boolean
  className?: string
}

const EXPORT_ITEMS: {
  format: ExportFormat
  label: string
  hint: string
  icon: typeof FileImage
  primary?: boolean
}[] = [
  {
    format: 'png',
    label: '客户效果图 PNG',
    hint: '高清成品图，交付客户',
    icon: FileImage,
    primary: true,
  },
  {
    format: 'pdf',
    label: '工厂施工参考 PDF',
    hint: '初版：先导出 PNG 占位',
    icon: FileText,
  },
  {
    format: 'svg',
    label: '矢量 SVG',
    hint: '导出文字图层为矢量',
    icon: FileType2,
  },
  {
    format: 'json',
    label: '项目源文件 JSON',
    hint: '保存项目版本，可再编辑',
    icon: FileJson,
  },
]

export function ExportPanel({ onExport, busy, className }: ExportPanelProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {EXPORT_ITEMS.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.format}
            type="button"
            disabled={busy}
            onClick={() => onExport(item.format)}
            className={cn(
              'flex w-full items-center gap-3 rounded-btn border px-3 py-2.5 text-left transition-all duration-150 disabled:opacity-50',
              item.primary
                ? 'border-blue/60 bg-blue/10 hover:bg-blue/20'
                : 'border-border bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.05]',
            )}
          >
            <Icon
              className={cn(
                'h-4 w-4 shrink-0',
                item.primary ? 'text-blue' : 'text-muted',
              )}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-text">
                {item.label}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                {item.hint}
              </span>
            </span>
            <Download className="h-4 w-4 shrink-0 text-muted" />
          </button>
        )
      })}
    </div>
  )
}
