import { useState } from 'react'
import * as Switch from '@radix-ui/react-switch'
import { useQuery } from '@tanstack/react-query'
import { Save, Check } from 'lucide-react'
import { WORKFLOW_STEPS } from '@/types'
import { PageHeader } from './Overview'
import { cn } from '@/utils/cn'

interface StepConfig {
  role: string
  name: string
  systemPrompt: string
  needConfirm: boolean
  credits: number
  enabled: boolean
}

const MOCK_STEPS: StepConfig[] = WORKFLOW_STEPS.map((s, i) => ({
  role: s.role,
  name: s.name,
  systemPrompt: `你是${s.name}专家，${s.description}。请根据输入产出结构化结果。`,
  needConfirm: i >= 4,
  credits: [2, 2, 3, 12, 8, 5][i] ?? 2,
  enabled: true,
}))

export function WorkflowPanel() {
  const { data } = useQuery({ queryKey: ['admin', 'workflow'], queryFn: async () => MOCK_STEPS })
  const [steps, setSteps] = useState<StepConfig[]>(data ?? MOCK_STEPS)
  const [saved, setSaved] = useState(false)
  const [enabledAll, setEnabledAll] = useState(true)

  const patch = (i: number, p: Partial<StepConfig>) =>
    setSteps((ss) => ss.map((s, idx) => (idx === i ? { ...s, ...p } : s)))

  const onSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <PageHeader title="工作流配置" desc="配置广告 AI 流程的 6 个岗位步骤" />
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-muted">
            全部启用
            <Switch.Root
              checked={enabledAll}
              onCheckedChange={(v) => {
                setEnabledAll(v)
                setSteps((ss) => ss.map((s) => ({ ...s, enabled: v })))
              }}
              className="relative h-5 w-9 rounded-full bg-white/15 transition-colors data-[state=checked]:bg-blue"
            >
              <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[18px]" />
            </Switch.Root>
          </label>
          <button className={cn('btn-primary', saved && '!from-green !to-green')} onClick={onSave}>
            {saved ? <Check size={15} /> : <Save size={15} />}
            {saved ? '已保存' : '保存配置'}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {steps.map((s, i) => (
          <section key={s.role} className="panel-card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-btn bg-panel-2 text-base">
                  {WORKFLOW_STEPS[i]?.icon}
                </span>
                <div>
                  <p className="text-sm font-semibold text-text">
                    {i + 1}. {s.name}
                  </p>
                  <p className="text-xs text-muted">角色：{s.role}</p>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted">
                启用
                <Switch.Root
                  checked={s.enabled}
                  onCheckedChange={(v) => patch(i, { enabled: v })}
                  className="relative h-5 w-9 rounded-full bg-white/15 transition-colors data-[state=checked]:bg-blue"
                >
                  <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[18px]" />
                </Switch.Root>
              </label>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className="mb-1.5 block text-xs text-muted">System Prompt</span>
                <textarea
                  value={s.systemPrompt}
                  onChange={(e) => patch(i, { systemPrompt: e.target.value })}
                  rows={2}
                  className="w-full rounded-btn border border-border bg-panel px-3 py-2 text-sm text-text outline-none focus:border-blue/60"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={s.needConfirm}
                  onChange={(e) => patch(i, { needConfirm: e.target.checked })}
                  className="h-4 w-4 accent-blue"
                />
                需人工确认
              </label>
              <label className="flex items-center gap-2 text-sm text-muted">
                积分消耗
                <input
                  type="number"
                  min={0}
                  value={s.credits}
                  onChange={(e) => patch(i, { credits: Number(e.target.value) })}
                  className="h-9 w-24 rounded-btn border border-border bg-panel px-3 text-sm text-text outline-none focus:border-blue/60"
                />
              </label>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
