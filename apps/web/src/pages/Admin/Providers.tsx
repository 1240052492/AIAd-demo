import { useState } from 'react'
import * as Switch from '@radix-ui/react-switch'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowUp,
  ArrowDown,
  KeyRound,
  Loader2,
  AlertTriangle,
  Plus,
  Trash2,
  Info,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from './Overview'
import { Tag } from '@/components/ui/Tag'
import { Dialog } from '@/components/ui/Dialog'
import { cn } from '@/utils/cn'
import {
  adminConfigApi,
  type ProviderConfig,
  type ProviderConfigCreate,
  type ProviderConfigInput,
} from '@/services/admin-config.api'

/** 常见协议/厂商标识（配置写库；密钥仍在服务端环境变量） */
const PROVIDER_PRESETS: { provider: string; displayName: string; hint: string }[] = [
  { provider: 'anthropic', displayName: 'Anthropic Claude', hint: '文本 / Brief 协议' },
  { provider: 'openai', displayName: 'OpenAI 兼容文本', hint: 'OpenAI Chat Completions 兼容' },
  { provider: 'openai_image', displayName: 'OpenAI 图像', hint: 'GPT-image / 图像生成' },
  { provider: 'banana2', displayName: 'Banana2', hint: '第三方图像协议' },
  { provider: 'azure_openai', displayName: 'Azure OpenAI', hint: 'Azure 部署' },
  { provider: 'custom', displayName: '自定义协议', hint: '自填 provider 标识' },
]

function ProviderRow({
  p,
  onToggle,
  onPriority,
  onSave,
  onDelete,
  saving,
}: {
  p: ProviderConfig
  onToggle: () => void
  onPriority: (d: -1 | 1) => void
  onSave: (field: keyof ProviderConfigInput, value: string | boolean | number) => void
  onDelete: () => void
  saving: boolean
}) {
  return (
    <section className="panel-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-btn bg-panel-2 text-blue">
            <KeyRound size={16} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text">{p.displayName || p.provider}</p>
            <p className="truncate font-mono text-xs text-muted">{p.provider}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <button className="btn-secondary !h-7 !px-2" disabled={p.priority <= 0 || saving} onClick={() => onPriority(-1)}>
              <ArrowUp size={14} />
            </button>
            <span className="w-14 text-center text-xs text-muted">优先级 {p.priority}</span>
            <button className="btn-secondary !h-7 !px-2" disabled={saving} onClick={() => onPriority(1)}>
              <ArrowDown size={14} />
            </button>
          </div>
          <Switch.Root
            checked={p.enabled}
            onCheckedChange={onToggle}
            disabled={saving}
            className="relative h-5 w-9 rounded-full bg-white/15 transition-colors data-[state=checked]:bg-blue"
          >
            <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[18px]" />
          </Switch.Root>
          <button
            type="button"
            className="btn-secondary !h-7 !px-2 text-xs !text-red !border-red/40"
            disabled={saving}
            onClick={onDelete}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs text-muted">显示名称</span>
          <input
            defaultValue={p.displayName}
            onBlur={(e) => e.target.value.trim() && onSave('displayName', e.target.value.trim())}
            className="h-9 w-full rounded-btn border border-border bg-panel px-3 text-sm text-text outline-none focus:border-blue/60"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs text-muted">模型</span>
          <input
            defaultValue={p.model}
            onBlur={(e) => onSave('model', e.target.value.trim())}
            className="h-9 w-full rounded-btn border border-border bg-panel px-3 font-mono text-sm text-text outline-none focus:border-blue/60"
          />
        </label>
        <label className="block md:col-span-2">
          <span className="mb-1.5 block text-xs text-muted">Base URL</span>
          <input
            defaultValue={p.baseUrl}
            onBlur={(e) => onSave('baseUrl', e.target.value.trim())}
            className="h-9 w-full rounded-btn border border-border bg-panel px-3 font-mono text-sm text-text outline-none focus:border-blue/60"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Tag tone={p.enabled ? 'green' : 'gray'}>{p.enabled ? '已启用' : '已禁用'}</Tag>
        {saving && <Loader2 size={14} className="animate-spin text-muted" />}
        <span className="text-[11px] text-muted">API Key 仅在服务端环境变量配置，此处永不展示</span>
      </div>
    </section>
  )
}

export function ProvidersPanel() {
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-config', 'provider-configs'],
    queryFn: adminConfigApi.getProviderConfigs,
  })
  const list = data ?? []
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<ProviderConfigCreate>({
    provider: 'openai_image',
    displayName: 'OpenAI 图像',
    baseUrl: '',
    model: '',
    enabled: true,
    priority: 10,
  })

  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ProviderConfigInput }) =>
      adminConfigApi.updateProviderConfig(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-config', 'provider-configs'] })
      toast.success('配置已保存')
    },
    onError: (e: Error) => toast.error(e.message || '保存失败'),
  })

  const createMut = useMutation({
    mutationFn: () => adminConfigApi.createProviderConfig(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-config', 'provider-configs'] })
      setCreating(false)
      toast.success('供应商已创建')
    },
    onError: (e: Error) => toast.error(e.message || '创建失败'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminConfigApi.deleteProviderConfig(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-config', 'provider-configs'] })
      toast.success('已删除')
    },
    onError: (e: Error) => toast.error(e.message || '删除失败'),
  })

  const savingId = (updateMut.isPending && updateMut.variables?.id) || undefined

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="API 配置 / 模型服务"
          desc="增删改查文本与图像服务配置，保存后即时生效。密钥只放服务端环境变量，不进前端。"
        />
        <button type="button" className="btn-primary !h-9" onClick={() => setCreating(true)}>
          <Plus size={15} /> 新增供应商
        </button>
      </div>

      <div className="flex items-start gap-2 rounded-btn border border-blue/30 bg-blue/8 px-4 py-3 text-sm text-muted">
        <Info size={16} className="mt-0.5 shrink-0 text-blue" />
        <p>
          支持 Anthropic、OpenAI 兼容、图像协议及自定义 provider 标识。启用后需在服务端配置对应 API
          Key，此处只维护路由、模型与启停。
        </p>
      </div>

      {isError && (
        <div className="flex items-center gap-2 rounded-btn border border-red/30 bg-red/8 px-4 py-3 text-sm text-red">
          <AlertTriangle size={15} /> 供应商配置加载失败，请稍后重试。
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-muted">
          <Loader2 size={16} className="animate-spin" /> 加载中…
        </div>
      ) : list.length === 0 ? (
        <div className="panel-card p-10 text-center text-sm text-muted">暂无供应商配置，请点击「新增供应商」。</div>
      ) : (
        <div className="space-y-3">
          {list.map((p) => (
            <ProviderRow
              key={p.id}
              p={p}
              saving={savingId === p.id || deleteMut.isPending}
              onToggle={() => updateMut.mutate({ id: p.id, patch: { enabled: !p.enabled } })}
              onPriority={(d) =>
                updateMut.mutate({ id: p.id, patch: { priority: Math.max(0, p.priority + d) } })
              }
              onSave={(field, value) => updateMut.mutate({ id: p.id, patch: { [field]: value } })}
              onDelete={() => {
                if (confirm(`确认删除「${p.displayName || p.provider}」？`)) deleteMut.mutate(p.id)
              }}
            />
          ))}
        </div>
      )}

      <Dialog open={creating} onOpenChange={(o) => !o && setCreating(false)} title="新增供应商" className="max-w-lg">
        <div className="space-y-3">
          <label className="block text-xs text-muted">
            协议 / 厂商预设
            <select
              className="mt-1 h-10 w-full rounded-btn border border-border bg-panel px-3 text-sm text-text"
              value={form.provider}
              onChange={(e) => {
                const preset = PROVIDER_PRESETS.find((x) => x.provider === e.target.value)
                setForm((f) => ({
                  ...f,
                  provider: e.target.value,
                  displayName: preset?.displayName || f.displayName,
                }))
              }}
            >
              {PROVIDER_PRESETS.map((p) => (
                <option key={p.provider} value={p.provider}>
                  {p.displayName} — {p.hint}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-muted">
            Provider 标识（唯一）
            <input
              className="mt-1 h-10 w-full rounded-btn border border-border bg-panel px-3 font-mono text-sm"
              value={form.provider}
              onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
            />
          </label>
          <label className="block text-xs text-muted">
            显示名称
            <input
              className="mt-1 h-10 w-full rounded-btn border border-border bg-panel px-3 text-sm"
              value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
            />
          </label>
          <label className="block text-xs text-muted">
            Base URL
            <input
              className="mt-1 h-10 w-full rounded-btn border border-border bg-panel px-3 font-mono text-sm"
              value={form.baseUrl || ''}
              onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
              placeholder="https://..."
            />
          </label>
          <label className="block text-xs text-muted">
            模型
            <input
              className="mt-1 h-10 w-full rounded-btn border border-border bg-panel px-3 font-mono text-sm"
              value={form.model || ''}
              onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-text">
            <input
              type="checkbox"
              checked={form.enabled !== false}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
            />
            创建后启用
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setCreating(false)}>
              取消
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={createMut.isPending || !form.provider.trim() || !form.displayName.trim()}
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
              创建
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
