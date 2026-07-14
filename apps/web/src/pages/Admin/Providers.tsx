import { useState } from 'react'
import * as Switch from '@radix-ui/react-switch'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUp, ArrowDown, KeyRound, Loader2, AlertTriangle } from 'lucide-react'
import { PageHeader } from './Overview'
import { Tag } from '@/components/ui/Tag'
import { cn } from '@/utils/cn'
import {
  adminConfigApi,
  type ProviderConfig,
  type ProviderConfigInput,
} from '@/services/admin-config.api'

function ProviderRow({
  p,
  onToggle,
  onPriority,
  onSave,
  saving,
}: {
  p: ProviderConfig
  onToggle: () => void
  onPriority: (d: -1 | 1) => void
  onSave: (field: keyof ProviderConfigInput, value: string | boolean | number) => void
  saving: boolean
}) {
  return (
    <section className="panel-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-btn bg-panel-2 text-blue">
            <KeyRound size={16} />
          </span>
          <div>
            <p className="text-sm font-semibold text-text">{p.displayName || p.provider}</p>
            <p className="font-mono text-xs text-muted">{p.provider}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <button
              className="btn-secondary !h-7 !px-2"
              disabled={p.priority <= 1 || saving}
              onClick={() => onPriority(-1)}
            >
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
            onBlur={(e) => e.target.value.trim() && onSave('model', e.target.value.trim())}
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

      <div className="mt-3 flex items-center gap-2">
        <Tag tone={p.enabled ? 'green' : 'gray'}>{p.enabled ? '已启用' : '已禁用'}</Tag>
        {saving && <Loader2 size={14} className="animate-spin text-muted" />}
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

  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ProviderConfigInput }) =>
      adminConfigApi.updateProviderConfig(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-config', 'provider-configs'] }),
  })

  const toggle = (p: ProviderConfig) =>
    updateMut.mutate({ id: p.id, patch: { enabled: !p.enabled } })
  const adjust = (p: ProviderConfig, dir: -1 | 1) =>
    updateMut.mutate({ id: p.id, patch: { priority: Math.max(0, p.priority + dir) } })
  const saveField = (p: ProviderConfig, field: keyof ProviderConfigInput, value: string | boolean | number) =>
    updateMut.mutate({ id: p.id, patch: { [field]: value } })

  return (
    <div className="space-y-5">
      <PageHeader title="模型供应商" desc="配置并启停模型供应商（实时写入服务端；密钥不在此展示）" />

      {isError && (
        <div className="flex items-center gap-2 rounded-btn border border-red/30 bg-red/8 px-4 py-3 text-sm text-red">
          <AlertTriangle size={15} /> 供应商配置加载失败，请稍后重试。
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-muted">
          <Loader2 size={16} className="animate-spin" /> 加载中…
        </div>
      ) : (
        <div className="space-y-3">
          {[...list]
            .sort((a, b) => a.priority - b.priority)
            .map((p) => (
              <ProviderRow
                key={p.id}
                p={p}
                saving={updateMut.isPending}
                onToggle={() => toggle(p)}
                onPriority={(d) => adjust(p, d)}
                onSave={(field, value) => saveField(p, field, value)}
              />
            ))}
        </div>
      )}
    </div>
  )
}
