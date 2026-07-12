import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, ImageOff } from 'lucide-react'
import { templateApi } from '@/services/api'
import { TEMPLATE_CATEGORIES, type Template } from '@/types'
import { DataTable, type Column } from '@/components/admin/DataTable'
import { Tag } from '@/components/ui/Tag'
import { Dialog } from '@/components/ui/Dialog'
import { PageHeader } from './Overview'
import { BUSINESS_TYPES } from '@/types'

interface FormState {
  id?: string
  title: string
  category: string
  businessType: string
  coverUrl: string
  prompt: string
}

const emptyForm: FormState = {
  title: '',
  category: TEMPLATE_CATEGORIES[1],
  businessType: BUSINESS_TYPES[0].key,
  coverUrl: '',
  prompt: '',
}

export function TemplatesPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'templates'],
    queryFn: () => templateApi.list({ page: 1, pageSize: 50 }),
  })

  const [items, setItems] = useState<Template[] | null>(null)
  const list = items ?? data?.data.items ?? []
  const [editing, setEditing] = useState<FormState | null>(null)

  const openNew = () => setEditing({ ...emptyForm })
  const openEdit = (t: Template) =>
    setEditing({
      id: t.id,
      title: t.title,
      category: t.category,
      businessType: t.businessType,
      coverUrl: t.coverUrl ?? '',
      prompt: t.prompt,
    })

  const save = () => {
    if (!editing) return
    const base: Template = {
      id: editing.id ?? `t_${Date.now()}`,
      title: editing.title || '未命名模板',
      category: editing.category,
      businessType: editing.businessType,
      coverUrl: editing.coverUrl || undefined,
      prompt: editing.prompt,
    }
    if (editing.id) {
      setItems((prev) => (prev ?? list).map((t) => (t.id === base.id ? base : t)))
    } else {
      setItems([base, ...(items ?? list)])
    }
    setEditing(null)
  }

  const remove = (id: string) => setItems((prev) => (prev ?? list).filter((t) => t.id !== id))

  const columns: Column<Template>[] = [
    {
      key: 'cover',
      header: '缩略图',
      cell: (r) =>
        r.coverUrl ? (
          <img src={r.coverUrl} alt={r.title} className="h-10 w-14 rounded-btn border border-border object-cover" />
        ) : (
          <span className="flex h-10 w-14 items-center justify-center rounded-btn bg-panel-2 text-muted">
            <ImageOff size={16} />
          </span>
        ),
    },
    { key: 'title', header: '标题', cell: (r) => <span className="font-medium text-text">{r.title}</span> },
    { key: 'category', header: '分类', cell: (r) => <Tag tone="blue">{r.category}</Tag> },
    {
      key: 'business',
      header: '业务类型',
      cell: (r) => BUSINESS_TYPES.find((b) => b.key === r.businessType)?.label ?? r.businessType,
    },
    {
      key: 'op',
      header: '操作',
      cell: (r) => (
        <div className="flex gap-2">
          <button className="btn-secondary !h-7 !px-2.5 text-xs" onClick={() => openEdit(r)}>
            <Pencil size={13} /> 编辑
          </button>
          <button className="btn-secondary !h-7 !px-2.5 text-xs !text-red" onClick={() => remove(r.id)}>
            <Trash2 size={13} /> 删除
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <PageHeader title="模板 / 提示词库" desc="管理广告流程模板及其提示词内容" />
        <button className="btn-primary" onClick={openNew}>
          <Plus size={15} /> 新增模板
        </button>
      </div>

      <DataTable columns={columns} data={list} loading={isLoading} rowKey={(r) => r.id} emptyText="暂无模板" />

      <Dialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing?.id ? '编辑模板' : '新增模板'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setEditing(null)}>取消</button>
            <button className="btn-primary" onClick={save}>保存</button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            <Labeled label="模板标题">
              <input
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                className="h-10 w-full rounded-btn border border-border bg-panel px-3 text-sm text-text outline-none focus:border-blue/60"
              />
            </Labeled>
            <div className="grid grid-cols-2 gap-3">
              <Labeled label="分类">
                <select
                  value={editing.category}
                  onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                  className="h-10 w-full rounded-btn border border-border bg-panel px-3 text-sm text-text outline-none focus:border-blue/60"
                >
                  {TEMPLATE_CATEGORIES.slice(1).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Labeled>
              <Labeled label="业务类型">
                <select
                  value={editing.businessType}
                  onChange={(e) => setEditing({ ...editing, businessType: e.target.value })}
                  className="h-10 w-full rounded-btn border border-border bg-panel px-3 text-sm text-text outline-none focus:border-blue/60"
                >
                  {BUSINESS_TYPES.map((b) => (
                    <option key={b.key} value={b.key}>{b.label}</option>
                  ))}
                </select>
              </Labeled>
            </div>
            <Labeled label="封面图 URL">
              <input
                value={editing.coverUrl}
                onChange={(e) => setEditing({ ...editing, coverUrl: e.target.value })}
                placeholder="https://…"
                className="h-10 w-full rounded-btn border border-border bg-panel px-3 text-sm text-text outline-none focus:border-blue/60"
              />
            </Labeled>
            <Labeled label="提示词内容">
              <textarea
                value={editing.prompt}
                onChange={(e) => setEditing({ ...editing, prompt: e.target.value })}
                rows={6}
                placeholder="输入该模板的提示词…"
                className="w-full rounded-btn border border-border bg-panel px-3 py-2 text-sm leading-relaxed text-text outline-none focus:border-blue/60"
              />
            </Labeled>
          </div>
        )}
      </Dialog>
    </div>
  )
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-muted">{label}</span>
      {children}
    </label>
  )
}
