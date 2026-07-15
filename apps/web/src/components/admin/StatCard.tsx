import { cn } from '@/utils/cn'

export type StatTone = 'green' | 'blue' | 'amber' | 'red' | 'gray'

const toneBorder: Record<StatTone, string> = {
  green: 'border-l-green',
  blue: 'border-l-blue',
  amber: 'border-l-amber',
  red: 'border-l-red',
  gray: 'border-l-white/15',
}

const toneText: Record<StatTone, string> = {
  green: 'text-green',
  blue: 'text-blue',
  amber: 'text-amber',
  red: 'text-red',
  gray: 'text-muted',
}

export interface StatCardProps {
  title: string
  value: React.ReactNode
  /** 趋势文案，例如 "+18%" */
  delta?: string
  /** 趋势正负（影响文字颜色） */
  trend?: 'up' | 'down' | 'warning'
  tone?: StatTone
  icon?: React.ReactNode
  /** 点击回调；提供后卡片变为可点击 */
  onClick?: () => void
}

/** 暗色主题统计卡片，左侧色条指示趋势 */
export function StatCard({ title, value, delta, trend = 'up', tone = 'gray', icon, onClick }: StatCardProps) {
  const deltaColor =
    trend === 'warning' ? 'text-red' : trend === 'down' ? 'text-red' : 'text-green'

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
      className={cn(
        'panel-card border-l-2 p-4 transition-colors hover:bg-panel-2/60',
        onClick && 'cursor-pointer',
        toneBorder[tone],
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">{title}</span>
        {icon && <span className={cn('opacity-80', toneText[tone])}>{icon}</span>}
      </div>
      <div className="mt-2 flex items-end gap-2">
        <span className="text-2xl font-bold leading-none text-text">{value}</span>
        {delta && (
          <span className={cn('pb-0.5 text-xs font-medium', deltaColor)}>{delta}</span>
        )}
      </div>
    </div>
  )
}
