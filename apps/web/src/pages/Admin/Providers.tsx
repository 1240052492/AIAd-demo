import { useState } from 'react'
import * as Switch from '@radix-ui/react-switch'
import { useQuery } from '@tanstack/react-query'
import { ArrowUp, ArrowDown, KeyRound, Eye, EyeOff } from 'lucide-react'
import { PageHeader } from './Overview'
import { Tag, type TagTone } from '@/components/ui/Tag'
import { maskKey } from './mask'

interface Provider {
  id: string
  name: string
  baseUrlKey: string
  modelKey: string
  apiKey: string
  enabled: boolean
  priority: number
}

const MOCK: Provider[] = [
  { id: 'p1', name: 'Anthropic 聊天', baseUrlKey: 'ANTHROPIC_BASE_URL', modelKey: 'ANTHROPIC_MODEL', apiKey: 'sk-ant-9f3a2b7c8d1e4f60', enabled: true, priority: 1 },
  { id: 'p2', name: 'GPT-image-2 生图', baseUrlKey: 'OPENAI_IMAGE_BASE_URL', modelKey: 'OPENAI_IMAGE_MODEL', apiKey: 'sk-img-2c4d6e8f0a1b3c5d', enabled: true, priority: 2 },
  { id: 'p3', name: 'OpenAI 聊天', baseUrlKey: 'OPENAI_BASE_URL', modelKey: 'OPENAI_MODEL', apiKey: 'sk-oa-7a9b1c3d5e7f9a0b', enabled: false, priority: 3 },
  { id: 'p4', name: 'banana2', baseUrlKey: 'BANANA2_BASE_URL', modelKey: 'BANANA2_MODEL', apiKey: 'sk-bn-1d3f5a7c9e2b4d6f', enabled: false, priority: 4 },
]

function ProviderRow({ p, onToggle, onPriority }: { p: Provider; onToggle: () => void; onPriority: (d: -1 | 1) => void }) {
  const [show, setShow] = useState(false)
  return (
    <section className="panel-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-btn bg-panel-2 text-blue">
            <KeyRound size={16} />
          </span>
          <div>
            <p className="text-sm font-semibold text-text">{p.name}</p>
            <p className="font-mono text-xs text-muted">
              {p.baseUrlKey} / {p.modelKey}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <button
              className="btn-secondary !h-7 !px-2"
              disabled={p.priority <= 1}
              onClick={() => onPriority(-1)}
            >
              <ArrowUp size={14} />
            </button>
            <span className="w-14 text-center text-xs text-muted">优先级 {p.priority}</span>
            <button className="btn-secondary !h-7 !px-2" onClick={() => onPriority(1)}>
              <ArrowDown size={14} />
            </button>
          </div>
          <Switch.Root
            checked={p.enabled}
            onCheckedChange={onToggle}
            className="relative h-5 w-9 rounded-full bg-white/15 transition-colors data-[state=checked]:bg-blue"
          >
            <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[18px]" />
          </Switch.Root>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-btn border border-border bg-panel px-3 py-2">
        <span className="text-xs text-muted">API Key</span>
        <code className="flex-1 truncate font-mono text-xs text-text">{show ? p.apiKey : maskKey(p.apiKey)}</code>
        <button
          className="text-muted hover:text-text"
          onClick={() => setShow((s) => !s)}
          title={show ? '隐藏' : '显示'}
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
        <Tag tone={(p.enabled ? 'green' : 'gray') as TagTone}>{p.enabled ? '已启用' : '已禁用'}</Tag>
      </div>
    </section>
  )
}

export function ProvidersPanel() {
  const { data } = useQuery({ queryKey: ['admin', 'providers'], queryFn: async () => MOCK })
  const [list, setList] = useState<Provider[]>(data ?? MOCK)

  const toggle = (id: string) =>
    setList((ls) =>
      ls
        .map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p))
        .sort((a, b) => a.priority - b.priority),
    )

  const adjust = (id: string, dir: -1 | 1) =>
    setList((ls) => {
      const sorted = [...ls].sort((a, b) => a.priority - b.priority)
      const idx = sorted.findIndex((p) => p.id === id)
      const swap = idx + dir
      if (swap < 0 || swap >= sorted.length) return ls
      ;[sorted[idx].priority, sorted[swap].priority] = [sorted[swap].priority, sorted[idx].priority]
      return sorted
    })

  return (
    <div className="space-y-5">
      <PageHeader title="模型供应商" desc="配置并启停模型供应商（Key 默认脱敏展示）" />
      <div className="space-y-3">
        {list
          .slice()
          .sort((a, b) => a.priority - b.priority)
          .map((p) => (
            <ProviderRow
              key={p.id}
              p={p}
              onToggle={() => toggle(p.id)}
              onPriority={(d) => adjust(p.id, d)}
            />
          ))}
      </div>
    </div>
  )
}
