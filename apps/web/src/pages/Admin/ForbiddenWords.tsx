import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, Loader2, Pencil, Plus, ShieldAlert, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from './Overview'
import { Dialog } from '@/components/ui/Dialog'
import { Tag } from '@/components/ui/Tag'
import {
  adminConfigApi,
  type ForbiddenWord,
  type ForbiddenWordInput,
} from '@/services/admin-config.api'

const EMPTY: ForbiddenWordInput = {
  word: '',
  category: 'general',
  matchType: 'contains',
  action: 'block',
  replacement: '',
  enabled: true,
}

const actionLabel = { block: '阻断', flag: '标记', replace: '替换' }

export function ForbiddenWordsPanel() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<ForbiddenWord | null>(null)
  const [creating, setCreating] = useState(false)
  const { data = [], isLoading } = useQuery({
    queryKey: ['admin-config', 'forbidden-words'],
    queryFn: adminConfigApi.getForbiddenWords,
  })

  const remove = useMutation({
    mutationFn: adminConfigApi.deleteForbiddenWord,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-config', 'forbidden-words'] })
      toast.success('词条已删除')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader title="违禁词库" desc="管理客户需求、工作流、提示词和生图请求中的内容规则" />
        <button className="btn-primary" onClick={() => setCreating(true)}>
          <Plus size={15} /> 新增词条
        </button>
      </div>

      <div className="flex items-start gap-3 rounded-btn border border-amber/35 bg-amber/8 px-4 py-3 text-sm text-muted">
        <ShieldAlert size={17} className="mt-0.5 shrink-0 text-amber" />
        <p>仅支持安全的字面匹配，不接受正则表达式。阻断会拒绝请求，标记只记录命中，替换会在提交 AI 前改写文字。</p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-muted"><Loader2 size={16} className="animate-spin" /> 加载中…</div>
      ) : data.length === 0 ? (
        <div className="panel-card flex flex-col items-center gap-3 py-14 text-center text-muted">
          <Ban size={28} />
          <p className="text-sm">暂无违禁词规则</p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.map((item) => (
            <article key={item.id} className="panel-card flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-[180px] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-text">{item.word}</span>
                  <Tag tone={item.enabled ? 'green' : 'gray'}>{item.enabled ? '启用' : '停用'}</Tag>
                  <Tag tone={item.action === 'block' ? 'red' : item.action === 'replace' ? 'amber' : 'blue'}>
                    {actionLabel[item.action]}
                  </Tag>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {item.category} · {item.matchType === 'whole_word' ? '完整词匹配' : '包含匹配'}
                  {item.action === 'replace' ? ` · 替换为 ${item.replacement || '***'}` : ''}
                </p>
              </div>
              <button className="btn-secondary !h-8 !px-2.5" onClick={() => setEditing(item)} aria-label="编辑词条">
                <Pencil size={14} />
              </button>
              <button
                className="btn-secondary !h-8 !px-2.5 !border-red/35 !text-red"
                onClick={() => confirm(`确认删除「${item.word}」？`) && remove.mutate(item.id)}
                aria-label="删除词条"
              >
                <Trash2 size={14} />
              </button>
            </article>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <ForbiddenWordForm
          item={editing || undefined}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => {
            setCreating(false)
            setEditing(null)
            void qc.invalidateQueries({ queryKey: ['admin-config', 'forbidden-words'] })
          }}
        />
      )}
    </div>
  )
}

function ForbiddenWordForm({ item, onClose, onSaved }: { item?: ForbiddenWord; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<ForbiddenWordInput>(item ? {
    word: item.word,
    category: item.category,
    matchType: item.matchType,
    action: item.action,
    replacement: item.replacement || '',
    enabled: item.enabled,
  } : EMPTY)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    try {
      if (item) await adminConfigApi.updateForbiddenWord(item.id, form)
      else await adminConfigApi.createForbiddenWord(form)
      toast.success(item ? '词条已更新' : '词条已创建')
      onSaved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={item ? '编辑违禁词' : '新增违禁词'}>
      <div className="space-y-4">
        <label className="block text-sm text-muted">词条
          <input className="mt-1 h-10 w-full rounded-btn border border-border bg-panel px-3 text-text" value={form.word} onChange={(e) => setForm({ ...form, word: e.target.value })} maxLength={100} />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm text-muted">分类
            <input className="mt-1 h-10 w-full rounded-btn border border-border bg-panel px-3 text-text" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </label>
          <label className="text-sm text-muted">匹配方式
            <select className="mt-1 h-10 w-full rounded-btn border border-border bg-panel px-3 text-text" value={form.matchType} onChange={(e) => setForm({ ...form, matchType: e.target.value as ForbiddenWordInput['matchType'] })}>
              <option value="contains">包含匹配</option><option value="whole_word">完整词匹配</option>
            </select>
          </label>
          <label className="text-sm text-muted">处理策略
            <select className="mt-1 h-10 w-full rounded-btn border border-border bg-panel px-3 text-text" value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value as ForbiddenWordInput['action'] })}>
              <option value="block">阻断请求</option><option value="flag">仅标记</option><option value="replace">自动替换</option>
            </select>
          </label>
          {form.action === 'replace' && <label className="text-sm text-muted">替换内容
            <input className="mt-1 h-10 w-full rounded-btn border border-border bg-panel px-3 text-text" value={form.replacement || ''} onChange={(e) => setForm({ ...form, replacement: e.target.value })} placeholder="***" />
          </label>}
        </div>
        <label className="flex items-center gap-2 text-sm text-text"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />启用规则</label>
        <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={onClose}>取消</button><button className="btn-primary" disabled={busy || !form.word.trim()} onClick={submit}>{busy && <Loader2 size={14} className="animate-spin" />}保存</button></div>
      </div>
    </Dialog>
  )
}
