import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Pencil, Loader2 } from 'lucide-react'
import { DataTable, type Column } from '@/components/admin/DataTable'
import { Tag, type TagTone } from '@/components/ui/Tag'
import { Dialog } from '@/components/ui/Dialog'
import { PageHeader } from './Overview'

interface AdminUser {
  id: string
  nickname: string
  phone: string
  email: string
  balance: number
  status: 'active' | 'disabled'
  createdAt: string
}

// 演示数据（后端暂无 /admin/users 接口）
const MOCK_USERS: AdminUser[] = [
  { id: 'u1', nickname: '张设计', phone: '13800001234', email: 'zhang@adcraft.ai', balance: 1280, status: 'active', createdAt: '2025-12-01 10:22' },
  { id: 'u2', nickname: '李广告', phone: '13900005678', email: 'li@adcraft.ai', balance: 360, status: 'active', createdAt: '2025-12-03 14:08' },
  { id: 'u3', nickname: '王制作', phone: '13700009012', email: 'wang@adcraft.ai', balance: 0, status: 'disabled', createdAt: '2025-12-05 09:41' },
  { id: 'u4', nickname: '陈运营', phone: '13600003456', email: 'chen@adcraft.ai', balance: 5400, status: 'active', createdAt: '2025-12-08 16:30' },
  { id: 'u5', nickname: '刘策划', phone: '13500007890', email: 'liu@adcraft.ai', balance: 92, status: 'active', createdAt: '2025-12-10 11:15' },
]

const columns: Column<AdminUser>[] = [
  { key: 'id', header: 'ID', cell: (r) => <span className="font-mono text-xs text-muted">{r.id}</span> },
  { key: 'nickname', header: '昵称', cell: (r) => <span className="font-medium text-text">{r.nickname}</span> },
  { key: 'phone', header: '手机', cell: (r) => r.phone },
  { key: 'email', header: '邮箱', cell: (r) => <span className="text-muted">{r.email}</span> },
  { key: 'balance', header: '积分余额', cell: (r) => <span className="font-semibold text-text">{r.balance}</span> },
  {
    key: 'status',
    header: '状态',
    cell: (r) => <Tag tone={(r.status === 'active' ? 'green' : 'gray') as TagTone}>{r.status === 'active' ? '正常' : '已禁用'}</Tag>,
  },
  { key: 'createdAt', header: '注册时间', cell: (r) => <span className="text-muted">{r.createdAt}</span> },
  { key: 'op', header: '操作', cell: (r) => <AdjustButton user={r} /> },
]

function AdjustButton({ user }: { user: AdminUser }) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  return (
    <>
      <button className="btn-secondary !h-7 !px-2.5 text-xs" onClick={() => setOpen(true)}>
        <Pencil size={13} /> 调整积分
      </button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`调整积分 · ${user.nickname}`}
        description={`当前余额：${user.balance} 积分`}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpen(false)}>取消</button>
            <button
              className="btn-primary"
              disabled={!amount}
              onClick={() => {
                // 演示：直接关闭，实际应调用 admin 接口
                setOpen(false)
                setAmount('')
                setReason('')
              }}
            >
              确认调整
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="调整金额（正为充值，负为扣减）">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="例如：100 或 -50"
              className="h-10 w-full rounded-btn border border-border bg-panel px-3 text-sm text-text outline-none focus:border-blue/60"
            />
          </Field>
          <Field label="调整原因">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="如：活动赠送 / 退款补偿"
              className="w-full rounded-btn border border-border bg-panel px-3 py-2 text-sm text-text outline-none focus:border-blue/60"
            />
          </Field>
        </div>
      </Dialog>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-muted">{label}</span>
      {children}
    </label>
  )
}

export function UsersPanel() {
  const [keyword, setKeyword] = useState('')
  const { data, isFetching } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => MOCK_USERS,
  })
  const users = (data ?? []).filter(
    (u) => !keyword || u.nickname.includes(keyword) || u.phone.includes(keyword) || u.email.includes(keyword),
  )

  return (
    <div className="space-y-5">
      <PageHeader title="用户与权限" desc="管理平台用户、积分余额与账号状态" />

      <div className="relative max-w-sm">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索昵称 / 手机 / 邮箱…"
          className="h-10 w-full rounded-btn border border-border bg-panel pl-9 pr-3 text-sm text-text placeholder:text-muted/70 outline-none focus:border-blue/60"
        />
      </div>

      <DataTable columns={columns} data={users} loading={isFetching} rowKey={(r) => r.id} emptyText="未找到匹配用户" />
    </div>
  )
}
