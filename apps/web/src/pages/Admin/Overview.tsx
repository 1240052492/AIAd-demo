import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, Users, Coins, AlertTriangle, Zap, Loader2 } from 'lucide-react'
import { StatCard } from '@/components/admin/StatCard'
import { DataTable, type Column } from '@/components/admin/DataTable'
import { Dialog } from '@/components/ui/Dialog'
import { Tag, type TagTone, statusTone } from '@/components/ui/Tag'
import { cn } from '@/utils/cn'
import {
  adminConfigApi,
  type ProviderConfig,
  type OverviewData,
  type OverviewDetailType,
  type OverviewDetailRow,
  type GenerationJob,
  type OverviewActiveUser,
  type OverviewCreditRow,
} from '@/services/admin-config.api'

function fmtTime(s?: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleString('zh-CN', { hour12: false })
}

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

const JOB_TYPE_LABEL: Record<string, string> = {
  brief: '需求整理',
  prompt: '提示词生成',
  image_generation: '视觉生图',
  composition: '环境合成',
  export: '导出输出',
}

const failedJobsColumns: Column<GenerationJob>[] = [
  { key: 'user', header: '账号', cell: (r) => r.userNickname || '未知用户' },
  { key: 'id', header: '任务ID', cell: (r) => <span className="font-mono text-xs text-muted">{r.id.slice(0, 14)}…</span> },
  {
    key: 'error',
    header: '报错信息',
    cell: (r) => <span className="whitespace-normal break-words text-xs text-red">{r.errorMessage || '—'}</span>,
    className: 'max-w-[360px]',
  },
  { key: 'time', header: '创建时间', cell: (r) => fmtTime(r.createdAt) },
]

const generationColumns: Column<GenerationJob>[] = [
  { key: 'id', header: '任务ID', cell: (r) => <span className="font-mono text-xs text-muted">{r.id.slice(0, 14)}…</span> },
  { key: 'user', header: '账号', cell: (r) => r.userNickname || '未知用户' },
  { key: 'type', header: '类型', cell: (r) => JOB_TYPE_LABEL[r.jobType] ?? r.jobType },
  {
    key: 'status',
    header: '状态',
    cell: (r) => <Tag tone={(statusTone(r.status) ?? 'gray') as TagTone}>{r.status}</Tag>,
  },
  { key: 'time', header: '创建时间', cell: (r) => fmtTime(r.createdAt) },
]

const activeUserColumns: Column<OverviewActiveUser>[] = [
  { key: 'user', header: '用户', cell: (r) => r.nickname || '未命名' },
  { key: 'phone', header: '手机', cell: (r) => r.phone || '—' },
  { key: 'email', header: '邮箱', cell: (r) => r.email || '—' },
  { key: 'time', header: '最后活跃', cell: (r) => fmtTime(r.updatedAt) },
]

const creditColumns: Column<OverviewCreditRow>[] = [
  { key: 'user', header: '用户', cell: (r) => r.userNickname || '未知用户' },
  { key: 'amount', header: '消耗积分', cell: (r) => <span className="text-amber">{r.amount}</span> },
  { key: 'reason', header: '原因', cell: (r) => r.reason || '—' },
  { key: 'time', header: '时间', cell: (r) => fmtTime(r.createdAt) },
]

function DetailTable({
  type,
  data,
  loading,
}: {
  type: OverviewDetailType
  data: OverviewDetailRow[]
  loading: boolean
}) {
  switch (type) {
    case 'failedJobs':
      return (
        <DataTable<GenerationJob>
          columns={failedJobsColumns}
          data={data as GenerationJob[]}
          loading={loading}
          rowKey={(r) => r.id}
          emptyText="暂无失败任务"
        />
      )
    case 'generations':
      return (
        <DataTable<GenerationJob>
          columns={generationColumns}
          data={data as GenerationJob[]}
          loading={loading}
          rowKey={(r) => r.id}
          emptyText="暂无今日生成记录"
        />
      )
    case 'activeUsers':
      return (
        <DataTable<OverviewActiveUser>
          columns={activeUserColumns}
          data={data as OverviewActiveUser[]}
          loading={loading}
          rowKey={(r) => r.id}
          emptyText="暂无今日活跃用户"
        />
      )
    case 'credits':
      return (
        <DataTable<OverviewCreditRow>
          columns={creditColumns}
          data={data as OverviewCreditRow[]}
          loading={loading}
          rowKey={(r) => r.id}
          emptyText="暂无今日积分消耗"
        />
      )
  }
}

export function Overview() {
  const [detailType, setDetailType] = useState<OverviewDetailType | null>(null)
  const [detailPage, setDetailPage] = useState(1)
  const detailPageSize = 10

  const overview = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: adminConfigApi.getOverview,
  })
  const providers = useQuery({
    queryKey: ['admin', 'provider-configs'],
    queryFn: adminConfigApi.getProviderConfigs,
  })
  const detail = useQuery({
    queryKey: ['admin', 'overview', 'details', detailType, detailPage],
    queryFn: () =>
      adminConfigApi.getOverviewDetails({
        type: detailType!,
        page: detailPage,
        pageSize: detailPageSize,
      }),
    enabled: !!detailType,
  })

  const d: OverviewData = overview.data ?? {
    todayGenerations: 0,
    activeUsers: 0,
    creditsConsumed: 0,
    failedJobs: 0,
  }
  const providerList = providers.data ?? []

  const stats = [
    {
      title: '今日生成',
      value: d.todayGenerations,
      tone: 'green' as const,
      icon: <Zap size={18} />,
      type: 'generations' as OverviewDetailType,
    },
    {
      title: '今日活跃用户',
      value: d.activeUsers,
      tone: 'blue' as const,
      icon: <Users size={18} />,
      type: 'activeUsers' as OverviewDetailType,
    },
    {
      title: '今日消耗积分',
      value: d.creditsConsumed,
      tone: 'amber' as const,
      icon: <Coins size={18} />,
      type: 'credits' as OverviewDetailType,
    },
    {
      title: '失败任务',
      value: d.failedJobs,
      tone: d.failedJobs > 0 ? ('red' as const) : ('green' as const),
      icon: <AlertTriangle size={18} />,
      type: 'failedJobs' as OverviewDetailType,
    },
  ]

  const detailTitle = {
    generations: '今日生成详情',
    activeUsers: '今日活跃用户详情',
    credits: '今日消耗积分详情',
    failedJobs: '失败任务详情',
  }[detailType ?? 'generations']

  const detailItems = detail.data?.items ?? []
  const detailTotal = detail.data?.total ?? 0
  const detailTotalPages = Math.max(1, Math.ceil(detailTotal / detailPageSize))

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
                  <StatCard
                    key={s.title}
                    title={s.title}
                    value={s.value}
                    tone={s.tone}
                    icon={s.icon}
                    onClick={() => {
                      setDetailType(s.type)
                      setDetailPage(1)
                    }}
                  />
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

          <Dialog
            open={!!detailType}
            onOpenChange={(open) => {
              if (!open) setDetailType(null)
            }}
            title={detailTitle}
            description={`共 ${detailTotal} 条记录`}
            className="max-w-4xl"
            footer={
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  className="btn-secondary !h-8 text-xs"
                  disabled={detailPage <= 1 || detail.isLoading}
                  onClick={() => setDetailPage((p) => Math.max(1, p - 1))}
                >
                  上一页
                </button>
                <span className="text-sm text-muted">
                  第 {detailPage} / {detailTotalPages} 页
                </span>
                <button
                  type="button"
                  className="btn-secondary !h-8 text-xs"
                  disabled={detailPage >= detailTotalPages || detail.isLoading}
                  onClick={() => setDetailPage((p) => Math.min(detailTotalPages, p + 1))}
                >
                  下一页
                </button>
              </div>
            }
          >
            {detailType && (
              <DetailTable type={detailType} data={detailItems} loading={detail.isLoading} />
            )}
          </Dialog>
        </>
      )}
    </div>
  )
}
