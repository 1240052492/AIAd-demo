import { useQuery } from '@tanstack/react-query'
import { Activity, Users, Coins, AlertTriangle, Zap, Loader2 } from 'lucide-react'
import { StatCard } from '@/components/admin/StatCard'
import { DataTable, type Column } from '@/components/admin/DataTable'
import { Tag } from '@/components/ui/Tag'
import {
  adminConfigApi,
  type ProviderConfig,
  type OverviewData,
} from '@/services/admin-config.api'

export function PageHeader({ title, desc }: { title: string; desc?: string }) {
  return (
    <div>
      <h1 className="text-xl font-bold text-text">{title}</h1>
      {desc && <p className="mt-1 text-sm text-muted">{desc}</p>}
    </div>
  )
}

const providerColumns: Column<ProviderConfig>[] = [
  {
    key: 'displayName',
    header: '模块',
    cell: (r) => <span className="font-medium text-text">{r.displayName || r.provider}</span>,
  },
  {
    key: 'config',
    header: '配置项',
    cell: (r) => <code className="text-xs text-muted">{r.baseUrl || '—'} / {r.model || '—'}</code>,
  },
  {
    key: 'status',
    header: '当前状态',
    cell: (r) => <Tag tone={r.enabled ? 'green' : 'gray'}>{r.enabled ? '已启用' : '已禁用'}</Tag>,
  },
  { key: 'desc', header: 'Provider', cell: (r) => <span className="text-muted">{r.provider}</span> },
]

export function Overview() {
  const overview = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: adminConfigApi.getOverview,
  })
  const providers = useQuery({
    queryKey: ['admin', 'provider-configs'],
    queryFn: adminConfigApi.getProviderConfigs,
  })

  const d: OverviewData = overview.data ?? {
    todayGenerations: 0,
    activeUsers: 0,
    creditsConsumed: 0,
    failedJobs: 0,
  }
  const providerList = providers.data ?? []

  const stats = [
    { title: '今日生成', value: d.todayGenerations, tone: 'green' as const, icon: <Zap size={18} /> },
    { title: '今日活跃用户', value: d.activeUsers, tone: 'blue' as const, icon: <Users size={18} /> },
    { title: '今日消耗积分', value: d.creditsConsumed, tone: 'amber' as const, icon: <Coins size={18} /> },
    {
      title: '失败任务',
      value: d.failedJobs,
      tone: d.failedJobs > 0 ? ('red' as const) : ('green' as const),
      icon: <AlertTriangle size={18} />,
    },
  ]

  const loading = overview.isLoading || providers.isLoading
  const error = overview.error || providers.error

  return (
    <div className="space-y-6">
      <PageHeader title="数据总览" desc="平台运行核心指标与 Provider 接入状态（实时数据）" />

      {error ? (
        <div className="panel-card p-6 text-sm text-red">数据加载失败，请稍后重试或检查网络连接。</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="panel-card border-l-2 border-l-white/15 p-4">
                    <div className="h-4 w-20 animate-pulse rounded bg-white/10" />
                    <div className="mt-2 h-8 w-16 animate-pulse rounded bg-white/10" />
                  </div>
                ))
              : stats.map((s) => (
                  <StatCard key={s.title} title={s.title} value={s.value} tone={s.tone} icon={s.icon} />
                ))}
          </div>

          <section className="panel-card">
            <header className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Activity size={15} className="text-blue" />
              <h2 className="text-sm font-semibold text-text">Provider 状态</h2>
            </header>
            <div className="p-2">
              {providers.isLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-muted">
                  <Loader2 size={16} className="animate-spin" /> 加载中…
                </div>
              ) : (
                <DataTable
                  columns={providerColumns}
                  data={providerList}
                  rowKey={(r) => r.id}
                  emptyText="暂无 Provider 配置"
                />
              )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
