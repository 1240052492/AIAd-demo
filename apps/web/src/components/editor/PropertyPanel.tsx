import {
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Type,
  Image as ImageIcon,
  Square,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import type { CanvasLayer } from '@/components/editor/types'
import { ColorPicker } from '@/components/editor/ColorPicker'
import { MaterialSelector } from '@/components/editor/MaterialSelector'

export interface PropertyPanelProps {
  selected: CanvasLayer | null
  canvasSize: { width: number; height: number }
  onChange: (patch: Partial<CanvasLayer>) => void
  onImageFilterChange: (patch: { brightness?: number; contrast?: number }) => void
  onRemove: () => void
  onDuplicate: () => void
  onBringForward: () => void
  onSendBackward: () => void
}

const FONT_WEIGHTS = [
  { label: '常规', value: 'normal' },
  { label: '中等', value: '500' },
  { label: '加粗', value: 'bold' },
  { label: '特粗', value: '900' },
]

function Field({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="block text-[11px] font-medium text-muted">{label}</label>
      {children}
    </div>
  )
}

function NumberInput({
  value,
  onChange,
  step = 1,
  min,
  max,
}: {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
}) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
      step={step}
      min={min}
      max={max}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-8 w-full rounded-md border border-border bg-panel-2 px-2 text-[13px] text-text outline-none focus:border-blue/60"
    />
  )
}

function Slider({
  value,
  onChange,
  min,
  max,
  step = 0.01,
}: {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
}) {
  return (
    <input
      type="range"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-blue"
    />
  )
}

export function PropertyPanel({
  selected,
  canvasSize,
  onChange,
  onImageFilterChange,
  onRemove,
  onDuplicate,
  onBringForward,
  onSendBackward,
}: PropertyPanelProps) {
  const typeIcon =
    selected?.type === 'text' ? (
      <Type className="h-3.5 w-3.5" />
    ) : selected?.type === 'image' ? (
      <ImageIcon className="h-3.5 w-3.5" />
    ) : (
      <Square className="h-3.5 w-3.5" />
    )

  return (
    <aside className="flex h-full w-[310px] shrink-0 flex-col border-l border-border bg-panel">
      {/* 当前图层信息 */}
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-text">图层与参数</h2>
        {selected ? (
          <div className="mt-2 flex items-center gap-2 rounded-md bg-white/[0.03] px-2.5 py-2">
            <span className="text-blue">{typeIcon}</span>
            <div className="min-w-0 flex-1">
              <input
                value={selected.name}
                onChange={(e) => onChange({ name: e.target.value })}
                className="w-full bg-transparent text-[13px] font-medium text-text outline-none"
              />
              <p className="truncate text-[10px] text-muted">{selected.id}</p>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-muted">
            在画布中选择一个图层以编辑其属性。
          </p>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {!selected && (
          <div className="rounded-btn border border-dashed border-border px-3 py-6 text-center text-[12px] text-muted">
            未选中图层
          </div>
        )}

        {selected && (
          <>
            {/* 文字图层属性 */}
            {selected.type === 'text' && (
              <>
                <Field label="文字内容">
                  <textarea
                    value={selected.content}
                    onChange={(e) => onChange({ content: e.target.value })}
                    rows={2}
                    className="w-full resize-none rounded-md border border-border bg-panel-2 px-2 py-1.5 text-[13px] text-text outline-none focus:border-blue/60"
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="字号">
                    <NumberInput
                      value={selected.fontSize ?? 64}
                      min={8}
                      onChange={(v) => onChange({ fontSize: v })}
                    />
                  </Field>
                  <Field label="字重">
                    <select
                      value={selected.fontWeight ?? 'bold'}
                      onChange={(e) => onChange({ fontWeight: e.target.value })}
                      className="h-8 w-full rounded-md border border-border bg-panel-2 px-2 text-[13px] text-text outline-none focus:border-blue/60"
                    >
                      {FONT_WEIGHTS.map((w) => (
                        <option key={w.value} value={w.value}>
                          {w.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <Field label="材质">
                  <MaterialSelector
                    value={selected.material}
                    onChange={(m) =>
                      onChange({ material: m.name, fill: m.fill })
                    }
                  />
                </Field>

                <Field label="颜色">
                  <ColorPicker
                    value={selected.fill}
                    onChange={(c) => onChange({ fill: c })}
                  />
                </Field>
              </>
            )}

            {/* 图片图层属性 */}
            {selected.type === 'image' && (
              <>
                <Field label={`透明度 ${Math.round((selected.opacity ?? 1) * 100)}%`}>
                  <Slider
                    value={selected.opacity ?? 1}
                    min={0}
                    max={1}
                    onChange={(v) => onChange({ opacity: v })}
                  />
                </Field>
                <Field label={`亮度 ${Math.round((selected.brightness ?? 0) * 100)}%`}>
                  <Slider
                    value={selected.brightness ?? 0}
                    min={-1}
                    max={1}
                    onChange={(v) => onImageFilterChange({ brightness: v })}
                  />
                </Field>
                <Field label={`对比度 ${Math.round((selected.contrast ?? 0) * 100)}%`}>
                  <Slider
                    value={selected.contrast ?? 0}
                    min={-1}
                    max={1}
                    onChange={(v) => onImageFilterChange({ contrast: v })}
                  />
                </Field>
              </>
            )}

            {/* 通用：位置 / 尺寸 / 旋转 */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="X 位置">
                <NumberInput value={selected.x} onChange={(v) => onChange({ x: v })} />
              </Field>
              <Field label="Y 位置">
                <NumberInput value={selected.y} onChange={(v) => onChange({ y: v })} />
              </Field>
              <Field label="宽度 W">
                <NumberInput
                  value={selected.width}
                  min={1}
                  onChange={(v) => {
                    if (!v || v <= 0) return
                    const base = selected.width / (selected.scaleX || 1) || 1
                    onChange({ scaleX: v / base })
                  }}
                />
              </Field>
              <Field label="高度 H">
                <NumberInput
                  value={selected.height}
                  min={1}
                  onChange={(v) => {
                    if (!v || v <= 0) return
                    const base = selected.height / (selected.scaleY || 1) || 1
                    onChange({ scaleY: v / base })
                  }}
                />
              </Field>
              <Field label="旋转角度">
                <NumberInput
                  value={selected.angle}
                  onChange={(v) => onChange({ angle: v })}
                />
              </Field>
              <Field label="透明度">
                <NumberInput
                  value={Math.round((selected.opacity ?? 1) * 100)}
                  min={0}
                  max={100}
                  onChange={(v) => onChange({ opacity: v / 100 })}
                />
              </Field>
            </div>

            {/* 可见性 / 锁定 */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onChange({ visible: !selected.visible })}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-btn border border-border bg-white/[0.02] py-2 text-[12px] text-muted hover:bg-white/[0.06]"
              >
                {selected.visible ? (
                  <Eye className="h-3.5 w-3.5" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" />
                )}
                {selected.visible ? '可见' : '隐藏'}
              </button>
              <button
                type="button"
                onClick={() => onChange({ locked: !selected.locked })}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-btn border py-2 text-[12px]',
                  selected.locked
                    ? 'border-blue/60 bg-blue/10 text-blue'
                    : 'border-border bg-white/[0.02] text-muted hover:bg-white/[0.06]',
                )}
              >
                {selected.locked ? (
                  <Lock className="h-3.5 w-3.5" />
                ) : (
                  <Unlock className="h-3.5 w-3.5" />
                )}
                {selected.locked ? '已锁定' : '未锁定'}
              </button>
            </div>

            {/* 排列 / 操作 */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onBringForward}
                className="flex items-center justify-center gap-1.5 rounded-btn border border-border bg-white/[0.02] py-2 text-[12px] text-muted hover:bg-white/[0.06]"
              >
                <ArrowUp className="h-3.5 w-3.5" /> 上移一层
              </button>
              <button
                type="button"
                onClick={onSendBackward}
                className="flex items-center justify-center gap-1.5 rounded-btn border border-border bg-white/[0.02] py-2 text-[12px] text-muted hover:bg-white/[0.06]"
              >
                <ArrowDown className="h-3.5 w-3.5" /> 下移一层
              </button>
              <button
                type="button"
                onClick={onDuplicate}
                className="flex items-center justify-center gap-1.5 rounded-btn border border-border bg-white/[0.02] py-2 text-[12px] text-muted hover:bg-white/[0.06]"
              >
                <Copy className="h-3.5 w-3.5" /> 复制
              </button>
              <button
                type="button"
                onClick={onRemove}
                className="flex items-center justify-center gap-1.5 rounded-btn border border-red/40 bg-red/10 py-2 text-[12px] text-red hover:bg-red/20"
              >
                <Trash2 className="h-3.5 w-3.5" /> 删除
              </button>
            </div>
          </>
        )}

        {/* 画布尺寸标注 */}
        <div className="rounded-md border border-border bg-white/[0.02] px-3 py-2">
          <p className="text-[11px] font-medium text-muted">画布尺寸</p>
          <p className="mt-0.5 text-[12px] text-text">
            {canvasSize.width} × {canvasSize.height} px（门头画布）
          </p>
        </div>
      </div>
    </aside>
  )
}
