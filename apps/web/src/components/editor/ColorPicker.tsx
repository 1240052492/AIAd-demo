import { cn } from '@/utils/cn'
import { PRESET_COLORS, type PresetColor } from '@/components/editor/types'

export interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
  className?: string
}

export function ColorPicker({ value, onChange, className }: ColorPickerProps) {
  const normalized = value?.toLowerCase()

  return (
    <div className={cn('grid grid-cols-6 gap-2', className)}>
      {PRESET_COLORS.map((c: PresetColor) => {
        const active = normalized === c.value.toLowerCase()
        return (
          <button
            key={c.value}
            type="button"
            title={`${c.name} ${c.value}`}
            onClick={() => onChange(c.value)}
            className={cn(
              'relative h-8 w-full rounded-full border transition-all duration-150',
              active
                ? 'ring-2 ring-blue ring-offset-2 ring-offset-panel'
                : 'border-white/15 hover:scale-105',
            )}
            style={{ backgroundColor: c.value }}
          >
            {active && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] font-bold text-black/70">
                ✓
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
