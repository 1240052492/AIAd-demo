import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Coins, TrendingDown, Receipt, Tag, Loader2 } from 'lucide-react'
import { cn } from '@/utils/cn'
import { membershipApi } from '@/services/membership.api'
import { useCreditStore } from '@/stores'

/** 分 → ¥ 格式化 */
export function formatYuan(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`
}

/** 积分（带千分位） */
export function formatPoints(n: number): string {
  return n.toLocaleString()
}

type RangeKey = 'today' | 'week' | 'month'

const RANGE_LABEL: Record<RangeKey, string> = {
  today: '今日',
  week: '本周',
  month: '本月',
}

function startOfRange(key: RangeKey): Date {
  const now = new Date()
  const d = new Date(now)
  if (key === 'today') {
    d.setHours(0, 0, 0, 0)
  } else if (key === 'week') {
    const day = d.getDay() || 7
    d.setDate(d.getDate() - day + 1)
    d.setHours(0, 0, 0, 0)
  } else {
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
  }
  return d
}

const TX_TYPE_LABEL: Record<string, string> = {
  register_bonus: '注册赠送',
  admin_adjust: '管理员调整',
  freeze: '冻结占用',
  consume: '消费扣减',
  refund: '失败退回',
  recharge: '充值入账',
}

const RULE_LABEL: Record<string, string> = {
  registerBonus: '新用户注册赠送',
  imageGeneration: '生成一张效果图',
  composition: '环境图合成',
  exportPng: '导出 PNG',
  exportPdf: '导出 PDF',
  exportSvg: '导出矢量 SVG',
  ocrValidation: '文字核对',
  textCorrection: '文字修正',
}

type FilterKey = 'all' | 'income' | 'expense' | string

export function PointsDetail({ compact = false }: { compact?: boolean }) {
  const setBalance = useCreditStore((s) => s.setBalance)
  const [typeFilter, setTypeFilter] = useState<FilterKey>('all')

  const balanceQ = useQuery({
    queryKey: ['membership', 'balance'],
    queryFn: async () => {
      const r = await membershipApi.getBalance()
      setBalance(r.data.balance, r.data.frozenBalance)
      return r.data
    },
  })

  const txQ = useQuery({
    queryKey: ['membership', 'transactions', 1],
    queryFn: async () => (await membershipApi.getTransactions(1, 50)).data,
  })

  const rulesQ = useQuery({
    queryKey: ['membership', 'rules'],
    queryFn: async () => (await membershipApi.getRules()).data,
  })

  const transactions = txQ.data?.items ?? []

  const filtered = useMemo(() => {
    if (typeFilter === 'all') return transactions
    if (typeFilter === 'income') return transactions.filter((t) => t.amount > 0)
    if (typeFilter === 'expense') return transactions.filter((t) => t.amount < 0)
    return transactions.filter((t) => t.type === typeFilter)
  }, [transactions, typeFilter])

  const totals = useMemo(() => {
    let income = 0
    let expense = 0
    for (const t of transactions) {
      if (t.amount > 0) income += t.amount
      else expense += Math.abs(t.amount)
    }
    return { income, expense }
  }, [transactions])

  const consumption = useMemo(() => {
    const ranges: Record<RangeKey, number> = { today: 0, week: 0, month: 0 }
    const now = Date.now()
    for (const t of transactions) {
      if (t.type !== 'consume') continue
      const ts = new Date(t.createdAt).getTime()
      if (ts >= startOfRange('today').getTime() && ts <= now) ranges.today += Math.abs(t.amount)
      if (ts >= startOfRange('week').getTime() && ts <= now) ranges.week += Math.abs(t.amount)
      if (ts >= startOfRange('month').getTime() && ts <= now) ranges.month += Math.abs(t.amount)
    }
    return ranges
  }, [transactions])

  const maxConsume = Math.max(consumption.today, consumption.week, consumption.month, 1)

  const rules = rulesQ.data
    ? Object.entries(rulesQ.data).map(([key, cost]) => ({ key, cost }))
    : []

  return (
    <div className={cn('space-y-5', compact && 'space-y-4')}>
      <section
        className={cn(
          'panel-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between',
          compact && 'p-4',
        )}
      >
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-card bg-gradient-to-br from-amber to-orange-400 text-[#221400]">
            <Coins size={22} />
          </div>
          <div>
            <p className="text-xs text-muted">可用余额</p>
            <p className="text-3xl font-bold tabular-nums text-text">
              {balanceQ.isLoading ? (
                <Loader2 className="inline h-6 w-6 animate-spin text-muted" />
              ) : (
                formatPoints(balanceQ.data?.balance ?? 0)
              )}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm sm:text-right">
          <div>
            <p className="text-xs text-muted">冻结中</p>
            <p className="font-semibold tabular-nums text-text">
              {formatPoints(balanceQ.data?.frozenBalance ?? 0)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted">累计收入 / 支出</p>
            <p className="tabular-nums">
              <span className="font-semibold text-green">+{formatPoints(totals.income)}</span>
              <span className="mx-1 text-muted">/</span>
              <span className="font-semibold text-red">-{formatPoints(totals.expense)}</span>
            </p>
          </div>
        </div>
      </section>

      <section className={cn('panel-card p-5', compact && 'p-4')}>
        <header className="mb-4 flex items-center gap-2">
          <TrendingDown size={16} className="text-amber" />
          <h2 className="text-sm font-semibold text-text">近期消费</h2>
        </header>
        <div className="flex items-end justify-around gap-6 px-2" style={{ height: 140 }}>
          {(Object.keys(RANGE_LABEL) as RangeKey[]).map((key) => {
            const val = consumption[key]
            const pct = Math.round((val / maxConsume) * 100)
            return (
              <div key={key} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                <span className="text-sm font-semibold tabular-nums text-text">{formatPoints(val)}</span>
                <div className="flex w-full max-w-[64px] flex-1 items-end justify-center">
                  <div
                    className="w-full rounded-t-card bg-gradient-to-t from-amber/70 to-amber transition-all"
                    style={{ height: `${Math.max(pct, val > 0 ? 6 : 2)}%` }}
                  />
                </div>
                <span className="text-xs text-muted">{RANGE_LABEL[key]}</span>
              </div>
            )
          })}
        </div>
      </section>

      <section className="panel-card overflow-hidden">
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Tag size={15} className="text-blue" />
          <h2 className="text-sm font-semibold text-text">积分规则说明</h2>
        </header>
        {rulesQ.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted" />
          </div>
        ) : (
          <div className="grid gap-px bg-border sm:grid-cols-2">
            {rules.map((r) => (
              <div key={r.key} className="flex items-center justify-between bg-panel px-4 py-3">
                <span className="text-sm text-text">{RULE_LABEL[r.key] || r.key}</span>
                <span
                  className={cn(
                    'rounded-pill px-2.5 py-0.5 text-xs font-semibold',
                    r.cost > 0 ? 'bg-red/10 text-red' : 'bg-green/10 text-green',
                  )}
                >
                  {r.cost > 0 ? `消耗 ${r.cost}` : r.cost < 0 ? `赠送 ${Math.abs(r.cost)}` : '免费'}
                </span>
              </div>
            ))}
            {rules.length === 0 && (
              <p className="col-span-full px-4 py-6 text-center text-sm text-muted">暂无积分规则</p>
            )}
          </div>
        )}
      </section>

      <section className="panel-card overflow-hidden">
        <header className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Receipt size={15} className="text-blue" />
            <h2 className="text-sm font-semibold text-text">我的积分流水</h2>
            <span className="text-xs text-muted">共 {txQ.data?.total ?? 0} 条</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {(
              [
                ['all', '全部'],
                ['income', '收入'],
                ['expense', '支出'],
                ['consume', '消费'],
                ['refund', '退回'],
                ['register_bonus', '赠送'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTypeFilter(key)}
                className={cn(
                  'h-7 rounded-md border px-2 text-[11px]',
                  typeFilter === key
                    ? 'border-blue/50 bg-blue/15 text-text'
                    : 'border-border text-muted hover:bg-white/5',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </header>
        {txQ.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted">暂无积分流水</p>
        ) : (
          <div className="max-h-[360px] overflow-y-auto">
            <ul className="divide-y divide-border">
              {filtered.map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text">{TX_TYPE_LABEL[t.type] ?? t.type}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">{t.reason || '—'}</p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {new Date(t.createdAt).toLocaleString('zh-CN', { hour12: false })}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        'font-semibold tabular-nums',
                        t.amount >= 0 ? 'text-green' : 'text-red',
                      )}
                    >
                      {t.amount >= 0 ? '+' : ''}
                      {t.amount}
                    </p>
                    <p className="text-[11px] text-muted">余额 {t.balanceAfter}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  )
}
