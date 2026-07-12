import { cn } from '@/utils/cn'
import { MATERIAL_OPTIONS, type MaterialOption } from '@/components/editor/types'

export interface MaterialSelectorProps {
  value?: string
  onChange: (material: MaterialOption) => void
  className?: string
}

export function MaterialSelector({
  value,
  onChange,
  className,
}: MaterialSelectorProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {MATERIAL_OPTIONS.map((m) => {
        const active = value === m.name
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(m)}
            className={cn(
              'flex w-full items-start gap-3 rounded-btn border p-2.5 text-left transition-all duration-150',
              active
                ? 'border-blue/70 bg-blue/10'
                : 'border-border bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]',
            )}
          >
            <span
              className="mt-0.5 h-6 w-6 shrink-0 rounded-md border border-white/15"
              style={{ backgroundColor: m.fill }}
            />
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-text">
                {m.name}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                {m.desc}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
