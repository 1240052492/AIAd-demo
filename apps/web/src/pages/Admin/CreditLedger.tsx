import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Receipt, Search } from 'lucide-react'
import { PageHeader } from './Overview'
import { adminConfigApi } from '@/services/admin-config.api'
import { cn } from '@/utils/cn'

const TYPE_LABEL: Record<string, string> = {
  register_bonus: '注册赠送',
  admin_adjust: '管理员调整',
  freeze: '冻结占用',
  consume: '消费扣减',
  refund: '失败退回',
  recharge: '充值入账',
}

const TYPE_FILTERS: { value: string; label: string }[] = [
  { value: '', label: '全部类型' },
  { value: 'consume', label: '消费' },
  { value: 'refund', label: '退回' },
  { value: 'freeze', label: '冻结' },
  { value: 'register_bonus', label: '注册赠送' },
  { value: 'admin_adjust', label: '管理员调整' },
  { value: 'recharge', label: '充值' },
]

type LedgerRow = {
  id: string
  userId: string
  userName: string
  userEmail: string | null
  type: string
  amount: number
  balanceAfter: number
  reason: string | null
  relatedType?: string | null
  relatedId?: string | null
  operatorName: string | null
  createdAt: string
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

function LedgerCard({ row }: { row: LedgerRow }) {
  return (
    <article className="rounded-card border border-border bg-panel/80 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text">{row.userName}</p>
          <p className="truncate text-[11px] text-muted">{row.userEmail || row.userId}</p>
        </div>
        <p
          className={cn(
            'shrink-0 text-base font-semibold tabular-nums',
            row.amount >= 0 ? 'text-green' : 'text-red',
          )}
        >
          {row.amount >= 0 ? '+' : ''}
          {row.amount}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
        <span className="rounded-md border border-border bg-bg/50 px-1.5 py-0.5">
          {TYPE_LABEL[row.type] || row.type}
        </span>
        <span>余额 {row.balanceAfter}</span>
        <span>{formatTime(row.createdAt)}</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-text/90">{row.reason || '—'}</p>
      {(row.relatedType || row.relatedId || row.operatorName) && (
        <p className="mt-1 truncate text-[11px] text-muted">
          {[row.operatorName && `操作人 ${row.operatorName}`, row.relatedType, row.relatedId]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
    </article>
  )
}

export function CreditLedgerPanel() {
  const [page, setPage] = useState(1)
  const [type, setType] = useState('')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const pageSize = 20

  const ledgerQ = useQuery({
    queryKey: ['admin-config', 'credit-transactions', page, type, debounced],
    queryFn: () =>
      adminConfigApi.getCreditTransactions({
        page,
        pageSize,
        type: type || undefined,
        search: debounced || undefined,
      }),
  })

  const items = (ledgerQ.data?.items ?? []) as LedgerRow[]
  const total = ledgerQ.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="积分流水"
        desc="全站积分变动明细。支持类型筛选与用户搜索（非仅当日汇总）。"
      />

      {/* 筛选：移动端纵向堆叠，桌面横排 */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full min-w-0 flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setDebounced(search.trim())
                setPage(1)
              }
            }}
            placeholder="搜索用户昵称 / 邮箱 / 手机"
            className="h-10 w-full rounded-btn border border-border bg-panel pl-9 pr-3 text-sm outline-none focus:border-blue/50"
          />
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value)
              setPage(1)
            }}
            className="h-10 min-w-0 flex-1 rounded-btn border border-border bg-panel px-3 text-sm outline-none sm:w-36 sm:flex-none"
          >
            {TYPE_FILTERS.map((f) => (
              <option key={f.value || 'all'} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-secondary !h-10 shrink-0 text-xs"
            onClick={() => {
              setDebounced(search.trim())
              setPage(1)
            }}
          >
            搜索
          </button>
        </div>
      </div>

      <section className="panel-card overflow-hidden">
        <header className="flex items-center gap-2 border-b border-border px-3 py-3 sm:px-4">
          <Receipt size={15} className="text-blue" />
          <h2 className="text-sm font-semibold">流水列表</h2>
          <span className="text-xs text-muted">共 {total} 条</span>
        </header>

        {ledgerQ.isLoading ? (
          <div className="flex justify-center py-12 text-muted">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : ledgerQ.isError ? (
          <p className="px-4 py-10 text-center text-sm text-amber">
            {ledgerQ.error instanceof Error ? ledgerQ.error.message : '流水加载失败'}
          </p>
        ) : items.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted">暂无积分流水</p>
        ) : (
          <>
            {/* 移动：卡片列表 */}
            <div className="space-y-2 p-3 md:hidden">
              {items.map((row) => (
                <LedgerCard key={row.id} row={row} />
              ))}
            </div>

            {/* 桌面：表格 */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-panel-2/80 text-left text-xs text-muted">
                    <th className="px-4 py-3 font-medium">时间</th>
                    <th className="px-4 py-3 font-medium">用户</th>
                    <th className="px-4 py-3 font-medium">类型</th>
                    <th className="px-4 py-3 font-medium">变动</th>
                    <th className="px-4 py-3 font-medium">余额</th>
                    <th className="px-4 py-3 font-medium">说明</th>
                    <th className="px-4 py-3 font-medium">操作人</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">{formatTime(row.createdAt)}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-text">{row.userName}</p>
                        <p className="text-[11px] text-muted">{row.userEmail || row.userId}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">{TYPE_LABEL[row.type] || row.type}</td>
                      <td
                        className={cn(
                          'px-4 py-3 font-semibold tabular-nums',
                          row.amount >= 0 ? 'text-green' : 'text-red',
                        )}
                      >
                        {row.amount >= 0 ? '+' : ''}
                        {row.amount}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted">{row.balanceAfter}</td>
                      <td className="max-w-[220px] px-4 py-3 text-muted">
                        <p className="truncate" title={row.reason || ''}>
                          {row.reason || '—'}
                        </p>
                        {row.relatedType || row.relatedId ? (
                          <p
                            className="mt-0.5 truncate text-[11px] text-muted/80"
                            title={`${row.relatedType || ''} ${row.relatedId || ''}`}
                          >
                            {[row.relatedType, row.relatedId].filter(Boolean).join(' · ')}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">{row.operatorName || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {totalPages > 1 ? (
          <footer className="flex items-center justify-between gap-2 border-t border-border px-3 py-3 sm:justify-end sm:px-4">
            <button className="btn-secondary !h-8 text-xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              上一页
            </button>
            <span className="text-xs text-muted">
              {page} / {totalPages}
            </span>
            <button
              className="btn-secondary !h-8 text-xs"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              下一页
            </button>
          </footer>
        ) : null}
      </section>
    </div>
  )
}
