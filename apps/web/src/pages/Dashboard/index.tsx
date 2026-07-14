import { useQuery } from '@tanstack/react-query'
import {
  Users,
  FolderKanban,
  ImagePlay,
  ImageIcon,
  Wallet,
  CalendarClock,
  Coins,
  AlertTriangle,
  Crown,
  Loader2,
} from 'lucide-react'
import { StatCard } from '@/components/admin/StatCard'
import { getDashboard, type DashboardMetrics } from '@/services/dashboard.api'

/** 单条「今日 vs 累计」对比条（纯 CSS，不使用任何虚构时间序列） */
function CompareBar({
  label,
  today,
  total,
}: {
  label: string
  today: number
  total: number
}) {
  const pct = total > 0 ? Math.min(100, Math.round((today / total) * 100)) : 0
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className="tabular-nums text-text">
          今日 <span className="font-semibold">{today.toLocaleString()}</span>
          <span className="text-muted"> / 累计 {total.toLocaleString()}</span>
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue to-[#7cc7ff]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[11px] text-muted">今日占比 {pct}%</p>
    </div>
  )
}

function MetricGrid({ d }: { d: DashboardMetrics }) {
  const yuan = (d.rechargeRevenueCents / 100).toLocaleString()
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard
        title="用户总数"
        value={d.totalUsers.toLocaleString()}
        tone="blue"
        icon={<Users size={18} />}
      />
      <StatCard
        title="项目总数"
        value={d.totalProjects.toLocaleString()}
        tone="blue"
        icon={<FolderKanban size={18} />}
      />
      <StatCard
        title="生图总数"
        value={d.totalGenerations.toLocaleString()}
        tone="green"
        icon={<ImagePlay size={18} />}
      />
      <StatCard
        title="今日生图"
        value={d.todayGenerations.toLocaleString()}
        tone="green"
        icon={<ImageIcon size={18} />}
      />
      <StatCard
        title="付费充值笔数"
        value={d.paidRecharges.toLocaleString()}
        tone="amber"
        icon={<Wallet size={18} />}
      />
      <StatCard
        title="今日充值笔数"
        value={d.todayRecharges.toLocaleString()}
        tone="amber"
        icon={<CalendarClock size={18} />}
      />
      <StatCard
        title="充值收入（元）"
        value={yuan}
        tone="amber"
        icon={<Coins size={18} />}
      />
      <StatCard
        title="累计消耗积分"
        value={d.creditsConsumedTotal.toLocaleString()}
        tone="blue"
        icon={<Coins size={18} />}
      />
      <StatCard
        title="失败任务"
        value={d.failedJobs.toLocaleString()}
        tone={d.failedJobs > 0 ? 'red' : 'gray'}
        trend={d.failedJobs > 0 ? 'warning' : 'up'}
        icon={<AlertTriangle size={18} />}
      />
      <StatCard
        title="活跃会员"
        value={d.activeMemberships.toLocaleString()}
        tone="blue"
        icon={<Crown size={18} />}
      />
    </div>
  )
}

export default function DashboardPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: getDashboard,
    // 概览数据变化不频繁，避免频繁打扰后端
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text">系统概览</h1>
        <p className="mt-1 text-sm text-muted">
          全部指标来自后端 <code className="text-xs">/api/dashboard</code> 实时聚合，均为数据库真实数据。
          {data?.generatedAt && (
            <span className="ml-1">
              更新时间：{new Date(data.generatedAt).toLocaleString('zh-CN')}
            </span>
          )}
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 py-20 text-muted">
          <Loader2 className="h-5 w-5 animate-spin" />
          正在加载真实概览数据…
        </div>
      )}

      {isError && (
        <div className="panel-card border-l-2 border-l-red p-4 text-sm text-red">
          加载失败：{(error as Error)?.message ?? '未知错误'}
        </div>
      )}

      {data && (
        <div className="space-y-6">
          <MetricGrid d={data} />

          <section className="panel-card p-5">
            <header className="mb-4 flex items-center gap-2">
              <CalendarClock size={15} className="text-blue" />
              <h2 className="text-sm font-semibold text-text">今日 vs 累计</h2>
            </header>
            <div className="grid gap-5 md:grid-cols-2">
              <CompareBar
                label="生图次数"
                today={data.todayGenerations}
                total={data.totalGenerations}
              />
              <CompareBar
                label="充值笔数"
                today={data.todayRecharges}
                total={data.paidRecharges}
              />
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
