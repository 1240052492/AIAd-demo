import { BUSINESS_TYPES } from '@/types'
import { cn } from '@/utils/cn'

interface BusinessTypeSelectProps {
  /** 当前选中的业务类型 key */
  value: string
  /** 选中变化回调 */
  onChange: (key: string) => void
  className?: string
}

/**
 * 业务类型选择器：以 pill-tag 形式列出 BUSINESS_TYPES，
 * 点击切换选中状态。
 */
export default function BusinessTypeSelect({ value, onChange, className }: BusinessTypeSelectProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {BUSINESS_TYPES.map((item) => {
        const active = item.key === value
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={cn('pill-tag', active && 'active')}
            aria-pressed={active}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
