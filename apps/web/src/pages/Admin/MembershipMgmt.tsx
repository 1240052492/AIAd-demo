import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import { DataTable, type Column } from '@/components/admin/DataTable'
import { Tag, type TagTone } from '@/components/ui/Tag'
import { Dialog } from '@/components/ui/Dialog'
import { PageHeader } from './Overview'
import { PermissionChecklist, EMPTY_PERMISSIONS } from './PermissionsEditor'
import {
  adminConfigApi,
  MembershipPlan,
  PlanInput,
  RolePermissions,
} from '@/services/admin-config.api'

function toYuan(fen: number) {
  return (fen / 100).toFixed(2)
}

export function MembershipMgmtPanel() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['admin-config', 'plans'],
    queryFn: adminConfigApi.getPlans,
  })

  const [editing, setEditing] = useState<MembershipPlan | null>(null)
  const [creating, setCreating] = useState(false)

  const plans = (data ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder)

  const removeMut = useMutation({
    mutationFn: (id: string) => adminConfigApi.deletePlan(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-config', 'plans'] }),
  })

  const columns: Column<MembershipPlan>[] = [
    { key: 'sortOrder', header: '排序', cell: (r) => <span className="text-muted">{r.sortOrder}</span> },
    { key: 'name', header: '套餐名', cell: (r) => <span className="font-medium text-text">{r.name}</span> },
    { key: 'code', header: 'Code', cell: (r) => <code className="text-xs text-muted">{r.code}</code> },
    {
      key: 'price',
      header: '价格',
      cell: (r) => <span className="text-text">¥{toYuan(r.price)}</span>,
    },
    { key: 'points', header: '积分', cell: (r) => <span className="text-text">{r.points}</span> },
    { key: 'durationDays', header: '时长', cell: (r) => <span className="text-muted">{r.durationDays} 天</span> },
    {
      key: 'rate',
      header: '消耗系数',
      cell: (r) => <span className="font-mono text-text">{r.rate}</span>,
    },
    {
      key: 'isActive',
      header: '状态',
      cell: (r) => (
        <Tag tone={(r.isActive ? 'green' : 'gray') as TagTone}>{r.isActive ? '上架' : '下架'}</Tag>
      ),
    },
    {
      key: 'op',
      header: '操作',
      cell: (r) => (
        <div className="flex gap-2">
          <button className="btn-secondary !h-7 !px-2.5 text-xs" onClick={() => setEditing(r)}>
            <Pencil size={13} /> 编辑
          </button>
          <button
            className="btn-secondary !h-7 !px-2.5 text-xs !text-red !border-red/40 hover:!bg-red/10"
            disabled={removeMut.isPending}
            onClick={() => {
              if (confirm(`确认删除套餐「${r.name}」？`)) removeMut.mutate(r.id)
            }}
          >
            <Trash2 size={13} /> 删除
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <PageHeader title="会员管理" desc="管理会员套餐：价格（分）、积分、时长、消耗系数与权限" />
        <button className="btn-primary" onClick={() => setCreating(true)}>
          <Plus size={15} /> 新建套餐
        </button>
      </div>

      <DataTable
        columns={columns}
        data={plans}
        loading={isLoading}
        rowKey={(r) => r.id}
        emptyText="暂无会员套餐"
      />

      {creating && (
        <PlanForm
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false)
            qc.invalidateQueries({ queryKey: ['admin-config', 'plans'] })
          }}
        />
      )}
      {editing && (
        <PlanForm
          plan={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            qc.invalidateQueries({ queryKey: ['admin-config', 'plans'] })
          }}
        />
      )}
    </div>
  )
}

function PlanForm({
  plan,
  onClose,
  onSaved,
}: {
  plan?: MembershipPlan
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!plan
  const [form, setForm] = useState<PlanInput>({
    code: plan?.code ?? '',
    name: plan?.name ?? '',
    description: plan?.description ?? '',
    price: plan?.price ?? 0,
    points: plan?.points ?? 0,
    durationDays: plan?.durationDays ?? 30,
    rate: plan?.rate ?? 1,
    permissions: plan?.permissions ?? { ...EMPTY_PERMISSIONS },
    isActive: plan?.isActive ?? true,
    sortOrder: plan?.sortOrder ?? 0,
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const set = <K extends keyof PlanInput>(k: K, v: PlanInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    setBusy(true)
    setErr(null)
    try {
      if (isEdit && plan) await adminConfigApi.updatePlan(plan.id, form)
      else await adminConfigApi.createPlan(form)
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={isEdit ? `编辑套餐 · ${plan?.name}` : '新建会员套餐'}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-primary" disabled={busy} onClick={submit}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : null}
            {isEdit ? '保存修改' : '创建'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="套餐 Code">
            <input
              value={form.code}
              onChange={(e) => set('code', e.target.value)}
              className={inputCls}
              placeholder="如 pro_monthly"
            />
          </Field>
          <Field label="套餐名称">
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              className={inputCls}
              placeholder="如 专业版月卡"
            />
          </Field>
        </div>

        <Field label="描述">
          <textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            rows={2}
            className={txtCls}
            placeholder="套餐卖点说明"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="价格（分）">
            <input
              type="number"
              min={0}
              value={form.price}
              onChange={(e) => set('price', Number(e.target.value))}
              className={inputCls}
            />
          </Field>
          <Field label="赠送积分">
            <input
              type="number"
              min={0}
              value={form.points}
              onChange={(e) => set('points', Number(e.target.value))}
              className={inputCls}
            />
          </Field>
          <Field label="有效期（天）">
            <input
              type="number"
              min={0}
              value={form.durationDays}
              onChange={(e) => set('durationDays', Number(e.target.value))}
              className={inputCls}
            />
          </Field>
          <Field label="消耗系数 rate">
            <input
              type="number"
              step={0.1}
              min={0}
              max={2}
              value={form.rate}
              onChange={(e) => set('rate', Number(e.target.value))}
              className={inputCls}
            />
          </Field>
          <Field label="排序 sortOrder">
            <input
              type="number"
              value={form.sortOrder}
              onChange={(e) => set('sortOrder', Number(e.target.value))}
              className={inputCls}
            />
          </Field>
          <Field label="上架状态">
            <label className="flex h-9 items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => set('isActive', e.target.checked)}
                className="h-4 w-4 accent-blue"
              />
              已上架（对用户可见）
            </label>
          </Field>
        </div>

        <Field label="套餐权限">
          <PermissionChecklist
            value={form.permissions as RolePermissions}
            onChange={(p) => set('permissions', p as PlanInput['permissions'])}
          />
        </Field>

        {err && <p className="text-sm text-red">{err}</p>}
      </div>
    </Dialog>
  )
}

const inputCls =
  'h-10 w-full rounded-btn border border-border bg-panel px-3 text-sm text-text outline-none focus:border-blue/60'
const txtCls =
  'w-full rounded-btn border border-border bg-panel px-3 py-2 text-sm text-text outline-none focus:border-blue/60'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-muted">{label}</span>
      {children}
    </label>
  )
}
