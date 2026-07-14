import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, Loader2, Check, ShieldCheck, Coins } from 'lucide-react'
import { DataTable, type Column } from '@/components/admin/DataTable'
import { Dialog } from '@/components/ui/Dialog'
import { PageHeader } from './Overview'
import { adminConfigApi, AdminUserRow } from '@/services/admin-config.api'
import { cn } from '@/utils/cn'

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
  const [picked, setPicked] = useState<string[]>([])
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
    mutationFn: ({ id, roleCodes }: { id: string; roleCodes: string[] }) =>
      adminConfigApi.setUserRoles(id, roleCodes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-config', 'users'] })
      setTarget(null)
    },
  })

  const openAssign = (u: AdminUserRow) => {
    setTarget(u)
    setPicked(u.roleCodes ?? [])
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
          <div className="flex flex-wrap gap-1.5">
            {r.roleCodes.map((c) => (
              <span
                key={c}
                className={cn('inline-flex h-6 items-center rounded-pill border px-2.5 text-xs font-medium', ROLE_TONE[c] ?? ROLE_TONE.guest)}
              >
                {c}
              </span>
            ))}
          </div>
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
          <button className="btn-primary !h-7 !px-2.5 text-xs" onClick={() => openAssign(r)}>
            <ShieldCheck size={13} /> 配置角色
          </button>
          <button className="btn-secondary !h-7 !px-2.5 text-xs" onClick={() => openAdjust(r)}>
            <Coins size={13} /> 调整积分
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
        description="勾选该用户拥有的角色；保存后即时生效，建议让用户重新登录以加载新权限"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setTarget(null)}>取消</button>
            <button
              className={cn('btn-primary', saveMut.isPending && 'opacity-60')}
              disabled={saveMut.isPending}
              onClick={() => target && saveMut.mutate({ id: target.id, roleCodes: picked })}
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
            const checked = picked.includes(role.code)
            return (
              <label
                key={role.code}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-btn border px-4 py-3 transition-colors',
                  checked ? 'border-blue/45 bg-blue/10' : 'border-border bg-panel hover:border-white/20',
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) =>
                    setPicked((prev) =>
                      e.target.checked
                        ? Array.from(new Set([...prev, role.code]))
                        : prev.filter((c) => c !== role.code),
                    )
                  }
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
    </div>
  )
}
