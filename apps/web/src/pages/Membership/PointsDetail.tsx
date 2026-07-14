import { useMemo } from 'react'
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
    const day = d.getDay() || 7 // 周一为一周起点
    d.setDate(d.getDate() - day + 1)
    d.setHours(0, 0, 0, 0)
  } else {
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
  }
  return d
}

/** 交易类型中文 */
const TX_TYPE_LABEL: Record<string, string> = {
  register_bonus: '注册赠送',
  admin_adjust: '后台调整',
  freeze: '冻结',
  consume: '消费',
  refund: '退款',
  recharge: '充值',
}

export function PointsDetail() {
  const setBalance = useCreditStore((s) => s.setBalance)

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
    <div className="space-y-5">
      {/* 余额卡片 */}
      <section className="panel-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-card bg-gradient-to-br from-amber to-orange-400 text-[#221400]">
            <Coins size={22} />
          </div>
          <div>
            <p className="text-xs text-muted">当前积分余额</p>
            <p className="text-3xl font-bold tabular-nums text-text">
              {balanceQ.isLoading ? (
                <Loader2 className="inline h-6 w-6 animate-spin text-muted" />
              ) : (
                formatPoints(balanceQ.data?.balance ?? 0)
              )}
            </p>
          </div>
        </div>
        <div className="text-right text-sm text-muted">
          <p>
            冻结积分：
            <span className="ml-1 font-medium text-text">
              {formatPoints(balanceQ.data?.frozenBalance ?? 0)}
            </span>
          </p>
        </div>
      </section>

      {/* 消费概览（CSS 柱状图） */}
      <section className="panel-card p-5">
        <header className="mb-4 flex items-center gap-2">
          <TrendingDown size={16} className="text-amber" />
          <h2 className="text-sm font-semibold text-text">消费概览</h2>
          <span className="ml-1 text-xs text-muted">（仅统计「消费」类型流水）</span>
        </header>
        <div className="flex items-end justify-around gap-6 px-2" style={{ height: 180 }}>
          {(Object.keys(RANGE_LABEL) as RangeKey[]).map((key) => {
            const val = consumption[key]
            const pct = Math.round((val / maxConsume) * 100)
            return (
              <div key={key} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                <span className="text-sm font-semibold tabular-nums text-text">
                  {formatPoints(val)}
                </span>
                <div className="flex w-full max-w-[64px] flex-1 items-end justify-center">
                  <div
                    className="w-full rounded-t-card bg-gradient-to-t from-amber/70 to-amber transition-all"
                    style={{ height: `${Math.max(pct, val > 0 ? 6 : 2)}%` }}
                    title={`${RANGE_LABEL[key]}消费 ${val} 积分`}
                  />
                </div>
                <span className="text-xs text-muted">{RANGE_LABEL[key]}</span>
              </div>
            )
          })}
        </div>
      </section>

      {/* 积分规则 */}
      <section className="panel-card overflow-hidden">
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Tag size={15} className="text-blue" />
          <h2 className="text-sm font-semibold text-text">积分规则</h2>
        </header>
        {rulesQ.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted" />
          </div>
        ) : (
          <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
            {rules.map((r) => (
              <div key={r.key} className="flex items-center justify-between bg-panel px-4 py-3">
                <span className="font-mono text-xs text-muted">{r.key}</span>
                <span
                  className={cn(
                    'rounded-pill px-2.5 py-0.5 text-xs font-semibold',
                    r.cost >= 0
                      ? 'bg-red/10 text-red'
                      : 'bg-green/10 text-green',
                  )}
                >
                  {r.cost >= 0 ? `消耗 ${r.cost}` : `赠送 ${Math.abs(r.cost)}`}
                </span>
              </div>
            ))}
            {rules.length === 0 && (
              <p className="col-span-full px-4 py-6 text-center text-sm text-muted">
                暂无积分规则
              </p>
            )}
          </div>
        )}
      </section>

      {/* 积分流水 */}
      <section className="panel-card overflow-hidden">
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Receipt size={15} className="text-blue" />
          <h2 className="text-sm font-semibold text-text">积分流水</h2>
          <span className="ml-1 text-xs text-muted">
            共 {txQ.data?.total ?? 0} 条
          </span>
        </header>
        {txQ.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted" />
          </div>
        ) : transactions.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted">暂无积分流水</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-panel-2/80 text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-medium">类型</th>
                  <th className="px-4 py-3 font-medium">变动</th>
                  <th className="px-4 py-3 font-medium">余额</th>
                  <th className="px-4 py-3 font-medium">说明</th>
                  <th className="px-4 py-3 font-medium">时间</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <span className="rounded-pill bg-white/5 px-2 py-0.5 text-xs text-muted">
                        {TX_TYPE_LABEL[t.type] ?? t.type}
                      </span>
                    </td>
                    <td
                      className={cn(
                        'px-4 py-3 font-semibold tabular-nums',
                        t.amount >= 0 ? 'text-green' : 'text-red',
                      )}
                    >
                      {t.amount >= 0 ? '+' : ''}
                      {t.amount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-text">{t.balanceAfter.toLocaleString()}</td>
                    <td className="px-4 py-3 text-muted">{t.reason ?? '-'}</td>
                    <td className="px-4 py-3 text-muted">
                      {new Date(t.createdAt).toLocaleString('zh-CN', { hour12: false })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
