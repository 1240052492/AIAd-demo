import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, ChevronDown, Loader2, AlertTriangle } from 'lucide-react'
import { DataTable, type Column } from '@/components/admin/DataTable'
import { Tag, type TagTone, statusTone } from '@/components/ui/Tag'
import { PageHeader } from './Overview'
import { cn } from '@/utils/cn'
import { adminConfigApi, type GenerationJob } from '@/services/admin-config.api'

const FILTERS = ['全部', 'succeeded', 'processing', 'failed', 'queued']
const JOB_TYPE_LABEL: Record<string, string> = {
  brief: '需求整理',
  prompt: '提示词生成',
  image_generation: '视觉生图',
  composition: '环境合成',
  export: '导出输出',
}

function fmtTime(s?: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleString('zh-CN', { hour12: false })
}

function fmtDuration(j: GenerationJob): string {
  if (j.finishedAt) {
    const ms = new Date(j.finishedAt).getTime() - new Date(j.createdAt).getTime()
    const sec = Math.max(0, ms / 1000)
    return sec >= 1 ? `${sec.toFixed(1)}s` : `${Math.round(ms)}ms`
  }
  if (j.status === 'processing') return '进行中'
  return '—'
}

export function TaskQueue() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState('全部')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const pageSize = 20

  const { data, isFetching, isError } = useQuery({
    queryKey: ['admin-config', 'jobs', filter, page],
    queryFn: () =>
      adminConfigApi.listJobs({
        status: filter === '全部' ? undefined : filter,
        page,
        pageSize,
      }),
  })

  const jobs = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const retryMut = useMutation({
    mutationFn: (id: string) => adminConfigApi.retryJob(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-config', 'jobs', filter, page] }),
  })

  const columns: Column<GenerationJob>[] = [
    { key: 'id', header: 'ID', cell: (r) => <span className="font-mono text-xs text-muted">{r.id.slice(0, 8)}</span> },
    { key: 'user', header: '用户', cell: (r) => r.userNickname || '未知用户' },
    { key: 'provider', header: 'Provider', cell: (r) => <span className="text-muted">{r.provider}</span> },
    { key: 'model', header: '模型', cell: (r) => <span className="text-muted">{r.model}</span> },
    { key: 'type', header: '类型', cell: (r) => JOB_TYPE_LABEL[r.jobType] ?? r.jobType },
    {
      key: 'status',
      header: '状态',
      cell: (r) => <Tag tone={(statusTone(r.status) ?? 'gray') as TagTone}>{r.status}</Tag>,
    },
    { key: 'duration', header: '耗时', cell: (r) => <span className="text-muted">{fmtDuration(r)}</span> },
    { key: 'createdAt', header: '创建时间', cell: (r) => <span className="text-muted">{fmtTime(r.createdAt)}</span> },
    {
      key: 'op',
      header: '操作',
      cell: (r) => (
        <div className="flex gap-2">
          <button
            className="btn-secondary !h-7 !px-2.5 text-xs"
            onClick={(e) => {
              e.stopPropagation()
              setExpanded((x) => (x === r.id ? null : r.id))
            }}
          >
            <ChevronDown size={13} className={cn(expanded === r.id && 'rotate-180')} style={{ transition: 'transform .2s' }} />
            详情
          </button>
          {r.status === 'failed' && (
            <button
              className="btn-secondary !h-7 !px-2.5 text-xs !text-amber"
              disabled={retryMut.isPending && retryMut.variables === r.id}
              onClick={(e) => {
                e.stopPropagation()
                retryMut.mutate(r.id)
              }}
            >
              {retryMut.isPending && retryMut.variables === r.id ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <RefreshCw size={13} />
              )}
              重试
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader title="生成任务队列" desc="查看实时生成任务、重试失败任务（真实数据）" />

      {isError && (
        <div className="flex items-center gap-2 rounded-btn border border-red/30 bg-red/8 px-4 py-3 text-sm text-red">
          <AlertTriangle size={15} /> 任务列表加载失败，请稍后重试。
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => { setFilter(f); setPage(1) }} className={cn('pill-tag', filter === f && 'active')}>
              {f === '全部' ? '全部' : f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-secondary !h-8 text-xs" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            上一页
          </button>
          <span className="text-sm text-muted">第 {page} / {totalPages} 页</span>
          <button className="btn-secondary !h-8 text-xs" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            下一页
          </button>
        </div>
      </div>

      <DataTable columns={columns} data={jobs} loading={isFetching} rowKey={(r) => r.id} emptyText="无匹配任务" />

      {expanded && (
        <div className="panel-card p-4">
          <p className="mb-1 text-sm font-medium text-muted">任务提示词</p>
          <pre className="whitespace-pre-wrap rounded-btn bg-panel-2 p-3 text-xs leading-relaxed text-text/90">
            {jobs.find((j) => j.id === expanded)?.prompt ?? '—'}
          </pre>
          {jobs.find((j) => j.id === expanded)?.errorMessage && (
            <p className="mt-2 text-xs text-red">错误信息：{jobs.find((j) => j.id === expanded)?.errorMessage}</p>
          )}
        </div>
      )}
    </div>
  )
}
