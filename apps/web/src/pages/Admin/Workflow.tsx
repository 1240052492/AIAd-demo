import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, Pencil, Trash2, Workflow as WorkflowIcon, AlertTriangle, GripVertical } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from './Overview'
import { Dialog } from '@/components/ui/Dialog'
import { Tag } from '@/components/ui/Tag'
import { cn } from '@/utils/cn'
import {
  adminConfigApi,
  type WorkflowTemplate,
  type WorkflowTemplateInput,
} from '@/services/admin-config.api'

type StepRow = {
  role: string
  name: string
  systemPrompt: string
  requireConfirm: boolean
  creditCost: number
}

const ROLE_OPTIONS = [
  { value: 'strategy', label: '策略' },
  { value: 'copywriter', label: '文案' },
  { value: 'creative-director', label: '创意总监' },
  { value: 'designer', label: '设计师' },
  { value: 'account-executive', label: '客户执行' },
  { value: 'boss', label: '总控' },
]

const DEFAULT_STEPS: StepRow[] = [
  {
    role: 'strategy',
    name: '需求简报分析',
    systemPrompt: '分析用户提供的项目简报，提炼核心诉求、目标人群与风格关键词。',
    requireConfirm: true,
    creditCost: 0,
  },
  {
    role: 'copywriter',
    name: '生成提示词',
    systemPrompt: '根据简报生成面向生图模型的高质量提示词。',
    requireConfirm: true,
    creditCost: 1,
  },
  {
    role: 'designer',
    name: 'AI 生图',
    systemPrompt: '调用生图模型生成主视觉图。',
    requireConfirm: false,
    creditCost: 2,
  },
]

function parseSteps(raw: unknown): StepRow[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_STEPS.map((s) => ({ ...s }))
  return raw.map((item) => {
    const o = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    return {
      role: String(o.role || 'designer'),
      name: String(o.name || '未命名步骤'),
      systemPrompt: String(o.systemPrompt || ''),
      requireConfirm: Boolean(o.requireConfirm),
      creditCost: Number.isFinite(Number(o.creditCost)) ? Number(o.creditCost) : 0,
    }
  })
}

function parseCreditRule(raw: unknown): { totalCap: number; note: string } {
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>
    return {
      totalCap: Number.isFinite(Number(o.totalCap)) ? Number(o.totalCap) : 0,
      note: String(o.note || ''),
    }
  }
  return { totalCap: 0, note: '' }
}

type FormState = {
  title: string
  businessType: string
  description: string
  isPublic: boolean
  steps: StepRow[]
  creditRule: { totalCap: number; note: string }
}

const EMPTY_FORM: FormState = {
  title: '',
  businessType: 'ad_material',
  description: '',
  isPublic: true,
  steps: DEFAULT_STEPS.map((s) => ({ ...s })),
  creditRule: { totalCap: 4, note: '按步骤 creditCost 累计；此处为建议上限说明' },
}

export function WorkflowPanel() {
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-config', 'workflows'],
    queryFn: () => adminConfigApi.listWorkflows({ pageSize: 100 }),
  })
  const items = data?.items ?? []

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<WorkflowTemplate | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  const openCreate = () => {
    setForm({
      ...EMPTY_FORM,
      steps: DEFAULT_STEPS.map((s) => ({ ...s })),
      creditRule: { ...EMPTY_FORM.creditRule },
    })
    setCreating(true)
  }
  const openEdit = (t: WorkflowTemplate) => {
    setForm({
      title: t.title,
      businessType: t.businessType,
      description: t.description ?? '',
      isPublic: t.isPublic,
      steps: parseSteps(t.stepsJson),
      creditRule: parseCreditRule(t.creditRuleJson),
    })
    setEditing(t)
  }
  const close = () => {
    setCreating(false)
    setEditing(null)
  }

  const toPayload = (): WorkflowTemplateInput => ({
    title: form.title.trim(),
    businessType: form.businessType,
    description: form.description,
    isPublic: form.isPublic,
    stepsJson: form.steps,
    creditRuleJson: {
      totalCap: form.creditRule.totalCap,
      note: form.creditRule.note,
      stepCosts: form.steps.map((s) => ({ name: s.name, creditCost: s.creditCost })),
    },
  })

  const createMut = useMutation({
    mutationFn: () => adminConfigApi.createWorkflow(toPayload()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-config', 'workflows'] })
      toast.success('模板已创建')
      close()
    },
    onError: (e: Error) => toast.error(e.message || '创建失败'),
  })
  const updateMut = useMutation({
    mutationFn: () => adminConfigApi.updateWorkflow(editing!.id, toPayload()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-config', 'workflows'] })
      toast.success('模板已更新')
      close()
    },
    onError: (e: Error) => toast.error(e.message || '更新失败'),
  })
  const deleteMut = useMutation({
    mutationFn: (id: string) => adminConfigApi.deleteWorkflow(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-config', 'workflows'] })
      toast.success('已删除')
    },
    onError: (e: Error) => toast.error(e.message || '删除失败'),
  })

  const saving = createMut.isPending || updateMut.isPending
  const dialogOpen = creating || !!editing

  const updateStep = (index: number, patch: Partial<StepRow>) => {
    setForm((f) => ({
      ...f,
      steps: f.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }))
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader
          title="工作流配置"
          desc="配置模板步骤（角色、顺序、提示、确认、积分）与积分规则；不伪造外部模型运行能力。"
        />
        <button type="button" className="btn-primary !h-9" onClick={openCreate}>
          <Plus size={15} /> 新建模板
        </button>
      </div>

      {isError && (
        <div className="flex items-center gap-2 rounded-btn border border-red/30 bg-red/8 px-4 py-3 text-sm text-red">
          <AlertTriangle size={15} /> 模板加载失败，请稍后重试。
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-muted">
          <Loader2 size={16} className="animate-spin" /> 加载中…
        </div>
      ) : items.length === 0 ? (
        <div className="panel-card p-10 text-center text-sm text-muted">暂无工作流模板，点击「新建模板」。</div>
      ) : (
        <div className="space-y-3">
          {items.map((t) => {
            const steps = parseSteps(t.stepsJson)
            const rule = parseCreditRule(t.creditRuleJson)
            return (
              <section key={t.id} className="panel-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-btn bg-panel-2 text-blue">
                      <WorkflowIcon size={16} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-text">{t.title}</h3>
                        <Tag tone={t.isPublic ? 'green' : 'gray'}>{t.isPublic ? '公开' : '私有'}</Tag>
                      </div>
                      <p className="mt-1 text-xs text-muted">{t.description || '—'}</p>
                      <p className="mt-2 text-[11px] text-muted">
                        {steps.length} 个步骤
                        {rule.totalCap > 0 ? ` · 建议积分上限 ${rule.totalCap}` : ''}
                      </p>
                      <ol className="mt-2 flex flex-wrap gap-1">
                        {steps.map((s, i) => (
                          <li
                            key={`${s.name}-${i}`}
                            className="rounded-md border border-border bg-bg/40 px-2 py-0.5 text-[10px] text-muted"
                          >
                            {i + 1}. {s.name}
                            {s.creditCost > 0 ? ` (${s.creditCost}积分)` : ''}
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="btn-secondary !h-8 text-xs" onClick={() => openEdit(t)}>
                      <Pencil size={13} /> 编辑
                    </button>
                    <button
                      type="button"
                      className="btn-secondary !h-8 text-xs !text-red !border-red/40"
                      onClick={() => {
                        if (confirm(`删除模板「${t.title}」？`)) deleteMut.mutate(t.id)
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </section>
            )
          })}
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => !o && close()}
        title={editing ? '编辑工作流模板' : '新建工作流模板'}
        className="max-w-2xl"
      >
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <label className="block text-xs text-muted">
            模板名称
            <input
              className="mt-1 h-10 w-full rounded-btn border border-border bg-panel px-3 text-sm text-text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </label>
          <label className="block text-xs text-muted">
            业务类型
            <input
              className="mt-1 h-10 w-full rounded-btn border border-border bg-panel px-3 text-sm text-text"
              value={form.businessType}
              onChange={(e) => setForm((f) => ({ ...f, businessType: e.target.value }))}
            />
          </label>
          <label className="block text-xs text-muted">
            说明
            <textarea
              className="mt-1 min-h-[64px] w-full rounded-btn border border-border bg-panel px-3 py-2 text-sm text-text"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isPublic}
              onChange={(e) => setForm((f) => ({ ...f, isPublic: e.target.checked }))}
            />
            公开模板
          </label>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-text">步骤配置（顺序即执行顺序）</p>
              <button
                type="button"
                className="btn-secondary !h-8 text-xs"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    steps: [
                      ...f.steps,
                      {
                        role: 'designer',
                        name: `步骤 ${f.steps.length + 1}`,
                        systemPrompt: '',
                        requireConfirm: false,
                        creditCost: 0,
                      },
                    ],
                  }))
                }
              >
                <Plus size={13} /> 添加步骤
              </button>
            </div>
            <div className="space-y-3">
              {form.steps.map((step, index) => (
                <div key={index} className="rounded-card border border-border bg-bg/40 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-xs text-muted">
                      <GripVertical size={14} /> 第 {index + 1} 步
                    </span>
                    <button
                      type="button"
                      className="text-xs text-red"
                      disabled={form.steps.length <= 1}
                      onClick={() =>
                        setForm((f) => ({ ...f, steps: f.steps.filter((_, i) => i !== index) }))
                      }
                    >
                      删除
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="text-[11px] text-muted">
                      步骤名称
                      <input
                        className="mt-1 h-9 w-full rounded-btn border border-border bg-panel px-2 text-sm"
                        value={step.name}
                        onChange={(e) => updateStep(index, { name: e.target.value })}
                      />
                    </label>
                    <label className="text-[11px] text-muted">
                      角色
                      <select
                        className="mt-1 h-9 w-full rounded-btn border border-border bg-panel px-2 text-sm"
                        value={step.role}
                        onChange={(e) => updateStep(index, { role: e.target.value })}
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-[11px] text-muted">
                      本步积分
                      <input
                        type="number"
                        min={0}
                        className="mt-1 h-9 w-full rounded-btn border border-border bg-panel px-2 text-sm"
                        value={step.creditCost}
                        onChange={(e) => updateStep(index, { creditCost: Number(e.target.value) || 0 })}
                      />
                    </label>
                    <label className="flex items-end gap-2 pb-1 text-sm">
                      <input
                        type="checkbox"
                        checked={step.requireConfirm}
                        onChange={(e) => updateStep(index, { requireConfirm: e.target.checked })}
                      />
                      需人工确认
                    </label>
                  </div>
                  <label className="mt-2 block text-[11px] text-muted">
                    步骤说明 / 系统提示
                    <textarea
                      className="mt-1 min-h-[56px] w-full rounded-btn border border-border bg-panel px-2 py-1.5 text-xs"
                      value={step.systemPrompt}
                      onChange={(e) => updateStep(index, { systemPrompt: e.target.value })}
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-muted">
              建议积分上限
              <input
                type="number"
                min={0}
                className="mt-1 h-10 w-full rounded-btn border border-border bg-panel px-3 text-sm"
                value={form.creditRule.totalCap}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    creditRule: { ...f.creditRule, totalCap: Number(e.target.value) || 0 },
                  }))
                }
              />
            </label>
            <label className="text-xs text-muted">
              积分规则说明
              <input
                className="mt-1 h-10 w-full rounded-btn border border-border bg-panel px-3 text-sm"
                value={form.creditRule.note}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    creditRule: { ...f.creditRule, note: e.target.value },
                  }))
                }
              />
            </label>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <button type="button" className="btn-secondary" onClick={close}>
              取消
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={saving || !form.title.trim() || form.steps.length === 0}
              onClick={() => (editing ? updateMut.mutate() : createMut.mutate())}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              保存模板
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
