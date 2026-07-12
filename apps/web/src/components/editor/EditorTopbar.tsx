import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Download, Snowflake, ChevronRight } from 'lucide-react'
import { cn } from '@/utils/cn'

export interface EditorTopbarProps {
  projectTitle: string
  subtitle?: string
  frozenCredits: number
  onSave: () => void
  onExport: () => void
  saving?: boolean
}

export function EditorTopbar({
  projectTitle,
  subtitle,
  frozenCredits,
  onSave,
  onExport,
  saving,
}: EditorTopbarProps) {
  const navigate = useNavigate()

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-panel px-4">
      {/* 左侧：返回 + 标题 */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-8 w-8 items-center justify-center rounded-btn border border-border bg-white/[0.02] text-muted transition-colors hover:bg-white/[0.06]"
          title="返回"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-1.5 text-[13px]">
          <span className="text-muted">门头效果图工作台</span>
          <ChevronRight className="h-3.5 w-3.5 text-muted/60" />
          <span className="font-semibold text-text">{projectTitle}</span>
          {subtitle && (
            <span className="ml-1 text-[12px] text-muted">/ {subtitle}</span>
          )}
        </div>
      </div>

      {/* 右侧：冻结积分 + 保存 + 导出 */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-pill border border-border bg-white/[0.03] px-3 py-1.5 text-[12px]">
          <Snowflake className="h-3.5 w-3.5 text-blue" />
          <span className="text-muted">冻结积分</span>
          <span className="font-semibold text-text">{frozenCredits}</span>
        </div>

        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className={cn(
            'inline-flex h-9 items-center gap-1.5 rounded-btn border border-border bg-white/[0.04] px-4 text-[13px] font-medium text-text transition-all hover:bg-white/[0.08] disabled:opacity-60',
          )}
        >
          <Save className="h-4 w-4" />
          {saving ? '保存中…' : '保存项目'}
        </button>

        <button
          type="button"
          onClick={onExport}
          className="btn-primary"
        >
          <Download className="h-4 w-4" />
          导出交付文件
        </button>
      </div>
    </header>
  )
}
