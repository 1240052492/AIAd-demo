import { BUSINESS_TYPES } from '@/types'
import { cn } from '@/utils/cn'

interface QuickBusinessCardsProps {
  /** 当前选中的业务类型 key */
  selected?: string
  /** 选择业务类型回调 */
  onSelect?: (key: string) => void
  className?: string
}

/**
 * 快捷业务卡片：5 列网格渲染 BUSINESS_TYPES。
 * 点击卡片联动选中对应业务类型。
 */
export default function QuickBusinessCards({ selected, onSelect, className }: QuickBusinessCardsProps) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5', className)}>
      {BUSINESS_TYPES.map((item) => {
        const active = item.key === selected
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect?.(item.key)}
            className={cn(
              'group flex flex-col rounded-card border bg-panel/70 p-3 text-left transition-all duration-150',
              active
                ? 'border-blue/60 bg-blue/10 shadow-lg shadow-blue/10'
                : 'border-border hover:border-white/20 hover:bg-panel-2',
            )}
          >
            <span
              className={cn(
                'text-sm font-semibold transition-colors',
                active ? 'text-blue' : 'text-text group-hover:text-blue',
              )}
            >
              {item.label}
            </span>
            <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{item.desc}</span>
          </button>
        )
      })}
    </div>
  )
}
