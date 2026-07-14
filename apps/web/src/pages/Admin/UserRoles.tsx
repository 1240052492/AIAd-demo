import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, Loader2, Check, ShieldCheck, Coins, UserPlus, Pencil, Trash2, AlertTriangle } from 'lucide-react'
import { DataTable, type Column } from '@/components/admin/DataTable'
import { Dialog } from '@/components/ui/Dialog'
import { PageHeader } from './Overview'
import { adminConfigApi, AdminUserRow, type RoleCode } from '@/services/admin-config.api'
import { cn } from '@/utils/cn'

/** 用户状态选项 */
const STATUS_OPTIONS = [
  { value: 'active', label: '正常' },
  { value: 'disabled', label: '禁用' },
  { value: 'banned', label: '封禁' },
] as const

/** 新增 / 编辑用户表单初始值 */
type UserForm = {
  nickname: string
  phone: string
  email: string
  password: string
  roleCode: RoleCode
  status: 'active' | 'disabled' | 'banned'
  initialCredits: string
}
const EMPTY_FORM: UserForm = {
  nickname: '',
  phone: '',
  email: '',
  password: '',
  roleCode: 'user',
  status: 'active',
  initialCredits: '0',
}

const ALL_ROLES = [
  { code: 'admin', label: '管理员' },
  { code: 'agent', label: '代理 / 渠道' },
  { code: 'user', label: '普通用户' },
  { code: 'guest', label: '访客' },
] as const

const ROLE_TONE: Record<string, string> = {
  admin: 'text-red border-red/45 bg-red/12',
  agent: 'text-amber border-amber/45 bg-amber/12',
  user: 'text-blue border-blue/45 bg-blue/12',
  guest: 'text-gray-400 border-white/12 bg-white/5',
}

export function UserRolesPanel() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const pageSize = 10

  const { data, isFetching } = useQuery({
    queryKey: ['admin-config', 'users', page, debounced],
    queryFn: () => adminConfigApi.getUsers({ page, pageSize, search: debounced || undefined }),
  })

  const users = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const [target, setTarget] = useState<AdminUserRow | null>(null)
  const [picked, setPicked] = useState<string>('')
  const [adjustTarget, setAdjustTarget] = useState<AdminUserRow | null>(null)
  const [adjAmount, setAdjAmount] = useState('')
  const [adjReason, setAdjReason] = useState('')

  const adjustMut = useMutation({
    mutationFn: ({ id, amount, reason }: { id: string; amount: number; reason?: string }) =>
      adminConfigApi.adjustCredits(id, amount, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-config', 'users'] })
      setAdjustTarget(null)
      setAdjAmount('')
      setAdjReason('')
    },
  })

  const saveMut = useMutation({
    mutationFn: ({ id, roleCode }: { id: string; roleCode: string }) =>
      adminConfigApi.setUserRoles(id, roleCode ? [roleCode] : []),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-config', 'users'] })
      setTarget(null)
    },
  })

  // ---- 新增 / 编辑 / 删除用户 ----
  const [editorOpen, setEditorOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null) // null=新增，否则编辑
  const [form, setForm] = useState<UserForm>(EMPTY_FORM)
  const [deleteTarget, setDeleteTarget] = useState<AdminUserRow | null>(null)

  const setField = <K extends keyof UserForm>(key: K, value: UserForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const openCreate = () => {
    setEditId(null)
    setForm(EMPTY_FORM)
    setEditorOpen(true)
  }

  const openEdit = (u: AdminUserRow) => {
    setEditId(u.id)
    setForm({
      nickname: u.nickname ?? '',
      phone: u.phone ?? '',
      email: u.email ?? '',
      password: '',
      roleCode: (u.roleCodes?.[0] as RoleCode) || 'user',
      status: (u.status as UserForm['status']) || 'active',
      initialCredits: '0',
    })
    setEditorOpen(true)
  }

  const saveUserMut = useMutation({
    mutationFn: async () => {
      if (editId) {
        // 编辑：仅提交基础信息 / 状态 / 可选密码（角色单独走 setUserRoles）
        await adminConfigApi.updateUser(editId, {
          nickname: form.nickname || undefined,
          phone: form.phone || undefined,
          email: form.email || undefined,
          password: form.password || undefined,
          status: form.status,
        })
        await adminConfigApi.setUserRoles(editId, form.roleCode ? [form.roleCode] : [])
      } else {
        await adminConfigApi.createUser({
          nickname: form.nickname || undefined,
          phone: form.phone || undefined,
          email: form.email || undefined,
          password: form.password,
          roleCode: form.roleCode,
          initialCredits: Number(form.initialCredits) || 0,
        })
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-config', 'users'] })
      setEditorOpen(false)
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminConfigApi.deleteUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-config', 'users'] })
      setDeleteTarget(null)
    },
  })

  const openAssign = (u: AdminUserRow) => {
    setTarget(u)
    setPicked(u.roleCodes?.[0] ?? '')
  }

  const openAdjust = (u: AdminUserRow) => {
    setAdjustTarget(u)
    setAdjAmount('')
    setAdjReason('')
  }

  const columns: Column<AdminUserRow>[] = [
    { key: 'nickname', header: '昵称', cell: (r) => <span className="font-medium text-text">{r.nickname ?? '—'}</span> },
    { key: 'phone', header: '手机', cell: (r) => <span className="text-muted">{r.phone ?? '—'}</span> },
    { key: 'email', header: '邮箱', cell: (r) => <span className="text-muted">{r.email ?? '—'}</span> },
    {
      key: 'creditBalance',
      header: '积分余额',
      cell: (r) => <span className="text-text">{r.creditBalance}</span>,
    },
    {
      key: 'roleCodes',
      header: '当前角色',
      cell: (r) =>
        r.roleCodes?.length ? (
          <span
            className={cn('inline-flex h-6 items-center rounded-pill border px-2.5 text-xs font-medium', ROLE_TONE[r.roleCodes[0]] ?? ROLE_TONE.guest)}
          >
            {r.roleCodes[0]}
          </span>
        ) : (
          <span className="text-muted">无</span>
        ),
    },
    {
      key: 'status',
      header: '状态',
      cell: (r) => <span className="text-muted">{r.status}</span>,
    },
    {
      key: 'op',
      header: '操作',
      cell: (r) => (
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary !h-7 !px-2.5 text-xs" onClick={() => openEdit(r)}>
            <Pencil size={13} /> 编辑
          </button>
          <button className="btn-primary !h-7 !px-2.5 text-xs" onClick={() => openAssign(r)}>
            <ShieldCheck size={13} /> 配置角色
          </button>
          <button className="btn-secondary !h-7 !px-2.5 text-xs" onClick={() => openAdjust(r)}>
            <Coins size={13} /> 调整积分
          </button>
          <button
            className="btn-secondary !h-7 !px-2.5 text-xs !text-red hover:!border-red/50"
            onClick={() => setDeleteTarget(r)}
          >
            <Trash2 size={13} /> 删除
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="用户角色权限"
        desc="为用户分配角色（guest / user / agent / admin）。保存后服务端即时更新，用户重新登录即按新角色 rate 与权限生效"
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (setDebounced(search), setPage(1))}
            placeholder="搜索昵称 / 手机 / 邮箱…"
            className="h-10 w-full rounded-btn border border-border bg-panel pl-9 pr-3 text-sm text-text placeholder:text-muted/70 outline-none focus:border-blue/60"
          />
        </div>
        <button
          className="btn-secondary !h-10 text-xs"
          onClick={() => {
            setDebounced(search)
            setPage(1)
          }}
        >
          搜索
        </button>
        <button className="btn-primary !h-10 text-xs ml-auto" onClick={openCreate}>
          <UserPlus size={15} /> 新增用户
        </button>
      </div>

      <DataTable
        columns={columns}
        data={users}
        loading={isFetching}
        rowKey={(r) => r.id}
        emptyText="未找到匹配用户"
      />

      <div className="flex items-center justify-end gap-3">
        <button
          className="btn-secondary !h-8 text-xs"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          上一页
        </button>
        <span className="text-sm text-muted">
          第 {page} / {totalPages} 页
        </span>
        <button
          className="btn-secondary !h-8 text-xs"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
        >
          下一页
        </button>
      </div>

      <Dialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        title={target ? `配置角色 · ${target.nickname ?? target.email ?? target.phone ?? target.id}` : ''}
        description="为该用户选择唯一角色（单选，不可同时勾选多个）；保存后即时生效，建议让用户重新登录以加载新权限"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setTarget(null)}>取消</button>
            <button
              className={cn('btn-primary', saveMut.isPending && 'opacity-60')}
              disabled={saveMut.isPending}
              onClick={() => target && saveMut.mutate({ id: target.id, roleCode: picked })}
            >
              {saveMut.isPending ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Check size={15} />
              )}
              保存角色
            </button>
          </>
        }
      >
        <div className="space-y-2">
          {ALL_ROLES.map((role) => {
            const selected = picked === role.code
            return (
              <label
                key={role.code}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-btn border px-4 py-3 transition-colors',
                  selected ? 'border-blue/45 bg-blue/10' : 'border-border bg-panel hover:border-white/20',
                )}
              >
                <input
                  type="radio"
                  name="admin-user-role"
                  checked={selected}
                  onChange={() => setPicked(role.code)}
                  className="h-4 w-4 accent-blue"
                />
                <span
                  className={cn('inline-flex h-6 items-center rounded-pill border px-2.5 text-xs font-medium', ROLE_TONE[role.code])}
                >
                  {role.code}
                </span>
                <span className="text-sm text-text">{role.label}</span>
              </label>
            )
          })}
          <label
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-btn border px-4 py-3 transition-colors',
              !picked ? 'border-blue/45 bg-blue/10' : 'border-border bg-panel hover:border-white/20',
            )}
          >
            <input
              type="radio"
              name="admin-user-role"
              checked={!picked}
              onChange={() => setPicked('')}
              className="h-4 w-4 accent-blue"
            />
            <span className="text-sm text-muted">不分配角色（无）</span>
          </label>
          {saveMut.isError && (
            <p className="text-sm text-red">
              {saveMut.error instanceof Error ? saveMut.error.message : '保存失败'}
            </p>
          )}
        </div>
      </Dialog>

      <Dialog
        open={!!adjustTarget}
        onOpenChange={(o) => !o && setAdjustTarget(null)}
        title={
          adjustTarget
            ? `调整积分 · ${adjustTarget.nickname ?? adjustTarget.email ?? adjustTarget.phone ?? adjustTarget.id}`
            : ''
        }
        description={`当前余额：${adjustTarget?.creditBalance ?? 0} 积分。正数为充值，负数为扣减。`}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setAdjustTarget(null)}>
              取消
            </button>
            <button
              className={cn('btn-primary', adjustMut.isPending && 'opacity-60')}
              disabled={adjustMut.isPending || !adjAmount}
              onClick={() =>
                adjustTarget &&
                adjustMut.mutate({
                  id: adjustTarget.id,
                  amount: Number(adjAmount),
                  reason: adjReason || undefined,
                })
              }
            >
              {adjustMut.isPending ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Check size={15} />
              )}
              确认调整
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm text-muted">调整金额（正为充值，负为扣减）</span>
            <input
              type="number"
              value={adjAmount}
              onChange={(e) => setAdjAmount(e.target.value)}
              placeholder="例如：100 或 -50"
              className="h-10 w-full rounded-btn border border-border bg-panel px-3 text-sm text-text outline-none focus:border-blue/60"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-muted">调整原因</span>
            <textarea
              value={adjReason}
              onChange={(e) => setAdjReason(e.target.value)}
              rows={3}
              placeholder="如：活动赠送 / 退款补偿"
              className="w-full rounded-btn border border-border bg-panel px-3 py-2 text-sm text-text outline-none focus:border-blue/60"
            />
          </label>
          {adjustMut.isError && (
            <p className="text-sm text-red">
              {adjustMut.error instanceof Error ? adjustMut.error.message : '调整失败'}
            </p>
          )}
        </div>
      </Dialog>

      {/* 新增 / 编辑用户 */}
      <Dialog
        open={editorOpen}
        onOpenChange={(o) => !o && setEditorOpen(false)}
        title={editId ? '编辑用户' : '新增用户'}
        description={
          editId
            ? '修改用户基础信息、角色与状态；密码留空则不修改'
            : '创建一个新用户，手机号或邮箱至少填写一个，密码至少 6 位'
        }
        className="max-w-lg"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setEditorOpen(false)}>
              取消
            </button>
            <button
              className={cn('btn-primary', saveUserMut.isPending && 'opacity-60')}
              disabled={saveUserMut.isPending}
              onClick={() => saveUserMut.mutate()}
            >
              {saveUserMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              {editId ? '保存修改' : '创建用户'}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="mb-1.5 block text-sm text-muted">昵称</span>
            <input
              value={form.nickname}
              onChange={(e) => setField('nickname', e.target.value)}
              placeholder="选填"
              className="h-10 w-full rounded-btn border border-border bg-panel px-3 text-sm text-text outline-none focus:border-blue/60"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-muted">手机号</span>
            <input
              value={form.phone}
              onChange={(e) => setField('phone', e.target.value)}
              placeholder="手机号 / 邮箱二选一"
              className="h-10 w-full rounded-btn border border-border bg-panel px-3 text-sm text-text outline-none focus:border-blue/60"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-muted">邮箱</span>
            <input
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              placeholder="手机号 / 邮箱二选一"
              className="h-10 w-full rounded-btn border border-border bg-panel px-3 text-sm text-text outline-none focus:border-blue/60"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-muted">
              密码{editId && <span className="text-muted/70">（留空不改）</span>}
            </span>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setField('password', e.target.value)}
              placeholder={editId ? '留空则不修改' : '至少 6 位'}
              className="h-10 w-full rounded-btn border border-border bg-panel px-3 text-sm text-text outline-none focus:border-blue/60"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-muted">角色</span>
            <select
              value={form.roleCode}
              onChange={(e) => setField('roleCode', e.target.value as RoleCode)}
              className="h-10 w-full rounded-btn border border-border bg-panel px-3 text-sm text-text outline-none focus:border-blue/60"
            >
              {ALL_ROLES.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}（{r.code}）
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-muted">状态</span>
            <select
              value={form.status}
              onChange={(e) => setField('status', e.target.value as UserForm['status'])}
              className="h-10 w-full rounded-btn border border-border bg-panel px-3 text-sm text-text outline-none focus:border-blue/60"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {!editId && (
            <label className="block">
              <span className="mb-1.5 block text-sm text-muted">初始积分</span>
              <input
                type="number"
                value={form.initialCredits}
                onChange={(e) => setField('initialCredits', e.target.value)}
                placeholder="0"
                className="h-10 w-full rounded-btn border border-border bg-panel px-3 text-sm text-text outline-none focus:border-blue/60"
              />
            </label>
          )}
        </div>
        {saveUserMut.isError && (
          <p className="mt-3 text-sm text-red">
            {saveUserMut.error instanceof Error ? saveUserMut.error.message : '保存失败'}
          </p>
        )}
      </Dialog>

      {/* 删除用户确认 */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="删除用户"
        description="此操作不可撤销，将同时清除该用户的项目、积分账户与流水等关联数据"
        className="max-w-md"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setDeleteTarget(null)}>
              取消
            </button>
            <button
              className={cn('btn-primary !bg-red hover:!bg-red/90', deleteMut.isPending && 'opacity-60')}
              disabled={deleteMut.isPending}
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
            >
              {deleteMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
              确认删除
            </button>
          </>
        }
      >
        <div className="flex items-start gap-3 rounded-btn border border-red/30 bg-red/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red" />
          <div className="text-sm text-text">
            确定要删除用户{' '}
            <span className="font-semibold">
              {deleteTarget?.nickname ?? deleteTarget?.email ?? deleteTarget?.phone ?? deleteTarget?.id}
            </span>{' '}
            吗？该用户的全部数据将被永久删除。
          </div>
        </div>
        {deleteMut.isError && (
          <p className="mt-3 text-sm text-red">
            {deleteMut.error instanceof Error ? deleteMut.error.message : '删除失败'}
          </p>
        )}
      </Dialog>
    </div>
  )
}
