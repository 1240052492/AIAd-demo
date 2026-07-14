import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Check, Plus, Pencil, Trash2, Workflow as WorkflowIcon, AlertTriangle } from 'lucide-react'
import { PageHeader } from './Overview'
import { Dialog } from '@/components/ui/Dialog'
import { Tag } from '@/components/ui/Tag'
import { cn } from '@/utils/cn'
import {
  adminConfigApi,
  type WorkflowTemplate,
  type WorkflowTemplateInput,
} from '@/services/admin-config.api'

const EMPTY_FORM: WorkflowTemplateInput = {
  title: '',
  businessType: 'ad_material',
  description: '',
  isPublic: true,
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
  const [form, setForm] = useState<WorkflowTemplateInput>(EMPTY_FORM)

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setCreating(true)
  }
  const openEdit = (t: WorkflowTemplate) => {
    setForm({
      title: t.title,
      businessType: t.businessType,
      description: t.description ?? '',
      isPublic: t.isPublic,
    })
    setEditing(t)
  }
  const close = () => {
    setCreating(false)
    setEditing(null)
  }

  const createMut = useMutation({
    mutationFn: () => adminConfigApi.createWorkflow(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-config', 'workflows'] })
      close()
    },
  })
  const updateMut = useMutation({
    mutationFn: () => adminConfigApi.updateWorkflow(editing!.id, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-config', 'workflows'] })
      close()
    },
  })
  const deleteMut = useMutation({
    mutationFn: (id: string) => adminConfigApi.deleteWorkflow(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-config', 'workflows'] }),
  })

  const saving = createMut.isPending || updateMut.isPending
  const dialogOpen = creating || !!editing

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <PageHeader title="工作流配置" desc="管理广告 AI 流程的工作流模板（实时数据）" />
        <button className="btn-primary !h-9" onClick={openCreate}>
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
        <div className="panel-card p-10 text-center text-sm text-muted">暂无工作流模板，点击右上角「新建模板」。</div>
      ) : (
        <div className="space-y-3">
          {items.map((t) => (
            <section key={t.id} className="panel-card flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-btn bg-panel-2 text-blue">
                  <WorkflowIcon size={16} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-text">{t.title}</p>
                  <p className="font-mono text-xs text-muted">
                    {t.businessType}
                    {t.description ? ` · ${t.description}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Tag tone={t.isPublic ? 'green' : 'gray'}>{t.isPublic ? '公开' : '私有'}</Tag>
                <button className="btn-secondary !h-7 !px-2.5 text-xs" onClick={() => openEdit(t)}>
                  <Pencil size={13} /> 编辑
                </button>
                <button
                  className="btn-secondary !h-7 !px-2.5 text-xs !text-red"
                  disabled={deleteMut.isPending}
                  onClick={() => {
                    if (confirm(`确认删除模板「${t.title}」？`)) deleteMut.mutate(t.id)
                  }}
                >
                  <Trash2 size={13} /> 删除
                </button>
              </div>
            </section>
          ))}
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => !o && close()}
        title={editing ? `编辑模板 · ${editing.title}` : '新建工作流模板'}
        footer={
          <>
            <button className="btn-secondary" onClick={close}>取消</button>
            <button
              className={cn('btn-primary', saving && 'opacity-60')}
              disabled={saving || !form.title?.trim()}
              onClick={() => (editing ? updateMut.mutate() : createMut.mutate())}
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              保存
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm text-muted">模板标题</span>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="如：门头招牌标准流程"
              className="h-10 w-full rounded-btn border border-border bg-panel px-3 text-sm text-text outline-none focus:border-blue/60"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-muted">业务类型（businessType）</span>
            <input
              value={form.businessType}
              onChange={(e) => setForm((f) => ({ ...f, businessType: e.target.value }))}
              placeholder="如：ad_material"
              className="h-10 w-full rounded-btn border border-border bg-panel px-3 font-mono text-sm text-text outline-none focus:border-blue/60"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-muted">描述</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full rounded-btn border border-border bg-panel px-3 py-2 text-sm text-text outline-none focus:border-blue/60"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={!!form.isPublic}
              onChange={(e) => setForm((f) => ({ ...f, isPublic: e.target.checked }))}
              className="h-4 w-4 accent-blue"
            />
            对外公开
          </label>
          {createMut.isError && (
            <p className="text-sm text-red">
              {createMut.error instanceof Error ? createMut.error.message : '创建失败'}
            </p>
          )}
          {updateMut.isError && (
            <p className="text-sm text-red">
              {updateMut.error instanceof Error ? updateMut.error.message : '更新失败'}
            </p>
          )}
        </div>
      </Dialog>
    </div>
  )
}
