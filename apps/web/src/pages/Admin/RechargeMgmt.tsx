import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Info } from 'lucide-react'
import { DataTable, type Column } from '@/components/admin/DataTable'
import { Tag, type TagTone } from '@/components/ui/Tag'
import { PageHeader } from './Overview'
import { adminConfigApi, RechargeRecord, RechargeStatus } from '@/services/admin-config.api'

const STATUS_LABELS: Record<RechargeStatus, { label: string; tone: TagTone }> = {
  pending: { label: '待支付', tone: 'amber' },
  paid: { label: '已支付', tone: 'green' },
  failed: { label: '失败', tone: 'red' },
  refunded: { label: '已退款', tone: 'gray' },
  canceled: { label: '已取消', tone: 'gray' },
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '全部状态' },
  { value: 'pending', label: '待支付' },
  { value: 'paid', label: '已支付' },
  { value: 'failed', label: '失败' },
  { value: 'refunded', label: '已退款' },
  { value: 'canceled', label: '已取消' },
]

export function RechargeMgmtPanel() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const pageSize = 10

  const { data, isFetching } = useQuery({
    queryKey: ['admin-config', 'recharges', page, status],
    queryFn: () =>
      adminConfigApi.getRecharges({ page, pageSize, status: status || undefined }),
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const columns: Column<RechargeRecord>[] = [
    { key: 'orderNo', header: '订单号', cell: (r) => <span className="font-mono text-xs text-muted">{r.orderNo}</span> },
    {
      key: 'user',
      header: '用户',
      cell: (r) =>
        r.user ? (
          <span className="text-text">
            {r.user.nickname ?? r.user.email ?? '—'}
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    { key: 'amount', header: '金额', cell: (r) => <span className="text-text">¥{r.amount}</span> },
    { key: 'points', header: '到账积分', cell: (r) => <span className="text-text">{r.points}</span> },
    {
      key: 'rate',
      header: '系数',
      cell: (r) => <span className="font-mono text-muted">{r.rate}</span>,
    },
    {
      key: 'payChannel',
      header: '支付渠道',
      cell: (r) => <span className="text-muted">{r.payChannel ?? '—'}</span>,
    },
    {
      key: 'status',
      header: '状态',
      cell: (r) => {
        const s = STATUS_LABELS[r.status]
        return <Tag tone={s.tone}>{s.label}</Tag>
      },
    },
    {
      key: 'createdAt',
      header: '创建时间',
      cell: (r) => <span className="text-muted">{r.createdAt}</span>,
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader title="积分管理" desc="查看用户充值订单与积分到账记录" />

      <div className="flex items-start gap-2 rounded-btn border border-blue/30 bg-blue/8 px-4 py-3 text-sm">
        <Info size={16} className="mt-0.5 shrink-0 text-blue" />
        <p className="text-muted">
          积分兑换规则：<span className="font-medium text-text">1 元 = 10 积分</span>；
          首次充值额外赠送 <span className="font-medium text-text">50 积分</span>（均为服务端常量，此处仅作说明展示）。
          下表为所有用户的充值订单记录。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
            className="h-10 w-full rounded-btn border border-border bg-panel pl-9 pr-3 text-sm text-text outline-none focus:border-blue/60"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <span className="text-sm text-muted">共 {total} 笔</span>
      </div>

      <DataTable
        columns={columns}
        data={items}
        loading={isFetching}
        rowKey={(r) => r.id}
        emptyText="暂无充值记录"
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
    </div>
  )
}
