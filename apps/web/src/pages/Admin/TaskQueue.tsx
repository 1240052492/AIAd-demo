import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Loader2, AlertTriangle, Pause, Coins, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { DataTable, type Column } from '@/components/admin/DataTable'
import { Tag, type TagTone, statusTone } from '@/components/ui/Tag'
import { PageHeader } from './Overview'
import { Dialog } from '@/components/ui/Dialog'
import { cn } from '@/utils/cn'
import { adminConfigApi, type GenerationJob } from '@/services/admin-config.api'

const FILTERS = ['全部', 'queued', 'processing', 'paused', 'succeeded', 'failed', 'canceled']
const STATUS_ZH: Record<string, string> = {
  queued: '排队中',
  submitted: '已提交',
  processing: '处理中',
  paused: '已暂停',
  succeeded: '成功',
  failed: '失败',
  canceled: '已取消',
}
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
  if (j.status === 'processing' || j.status === 'queued') return '进行中'
  return '—'
}

function JobActions({
  job,
  busyId,
  onDetail,
  onPause,
  onRetry,
  onRefund,
  compact,
}: {
  job: GenerationJob
  busyId: string | null
  onDetail: () => void
  onPause: () => void
  onRetry: () => void
  onRefund: () => void
  compact?: boolean
}) {
  const canPause = ['queued', 'submitted', 'processing'].includes(job.status)
  const canRetry = ['failed', 'canceled'].includes(job.status)
  const canRefund = ['queued', 'submitted', 'processing', 'paused'].includes(job.status)
  const busy = busyId === job.id
  const btn = compact ? 'btn-secondary !h-8 flex-1 min-w-[calc(50%-0.25rem)] !px-2 text-[11px]' : 'btn-secondary !h-7 !px-2 text-xs'

  return (
    <div className={cn('flex flex-wrap gap-1.5', compact && 'w-full')}>
      <button type="button" className={btn} onClick={onDetail}>
        <Eye size={13} /> 返回数据
      </button>
      {canPause && (
        <button type="button" className={btn} disabled={busy} onClick={onPause}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Pause size={13} />}
          暂停
        </button>
      )}
      {canRetry && (
        <button type="button" className={cn(btn, '!text-amber')} disabled={busy} onClick={onRetry}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          重试
        </button>
      )}
      {canRefund && (
        <button type="button" className={cn(btn, '!text-red !border-red/40')} disabled={busy} onClick={onRefund}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Coins size={13} />}
          退还积分
        </button>
      )}
    </div>
  )
}

function JobCard({
  job,
  busyId,
  onDetail,
  onPause,
  onRetry,
  onRefund,
}: {
  job: GenerationJob
  busyId: string | null
  onDetail: () => void
  onPause: () => void
  onRetry: () => void
  onRefund: () => void
}) {
  return (
    <article className="rounded-card border border-border bg-panel/80 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[11px] text-muted">{job.id.slice(0, 12)}…</p>
          <p className="mt-0.5 truncate text-sm font-medium text-text">{job.userNickname || '未知用户'}</p>
        </div>
        <Tag tone={(statusTone(job.status) ?? 'gray') as TagTone}>{STATUS_ZH[job.status] || job.status}</Tag>
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted">
        <div>
          <dt className="text-muted/80">类型</dt>
          <dd className="text-text">{JOB_TYPE_LABEL[job.jobType] ?? job.jobType}</dd>
        </div>
        <div>
          <dt className="text-muted/80">积分</dt>
          <dd className="text-text">
            冻 {job.creditsFrozen ?? 0} / 消 {job.creditsConsumed ?? 0}
          </dd>
        </div>
        <div>
          <dt className="text-muted/80">耗时</dt>
          <dd className="text-text">{fmtDuration(job)}</dd>
        </div>
        <div>
          <dt className="text-muted/80">创建</dt>
          <dd className="text-text">{fmtTime(job.createdAt)}</dd>
        </div>
      </dl>

      {job.errorMessage ? (
        <p className="mt-2 line-clamp-3 rounded-md border border-red/25 bg-red/8 px-2 py-1.5 text-[11px] leading-relaxed text-red">
          {job.errorMessage}
        </p>
      ) : null}

      <div className="mt-3 border-t border-border pt-3">
        <JobActions
          job={job}
          busyId={busyId}
          compact
          onDetail={onDetail}
          onPause={onPause}
          onRetry={onRetry}
          onRefund={onRefund}
        />
      </div>
    </article>
  )
}

export function TaskQueue() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState('全部')
  const [page, setPage] = useState(1)
  const [detailId, setDetailId] = useState<string | null>(null)
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

  const detailQ = useQuery({
    queryKey: ['admin-config', 'job-detail', detailId],
    queryFn: () => adminConfigApi.getJob(detailId!),
    enabled: !!detailId,
  })

  const jobs = (data?.items ?? []).slice().sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-config', 'jobs'] })

  const retryMut = useMutation({
    mutationFn: (id: string) => adminConfigApi.retryJob(id),
    onSuccess: () => {
      toast.success('任务已重新入队')
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message || '重试失败'),
  })
  const pauseMut = useMutation({
    mutationFn: (id: string) => adminConfigApi.pauseJob(id),
    onSuccess: () => {
      toast.success('任务已暂停')
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message || '暂停失败'),
  })
  const refundMut = useMutation({
    mutationFn: (id: string) => adminConfigApi.refundJob(id),
    onSuccess: () => {
      toast.success('已取消任务并退还冻结积分（不可重复退款）')
      invalidate()
      if (detailId) qc.invalidateQueries({ queryKey: ['admin-config', 'job-detail', detailId] })
    },
    onError: (e: Error) => toast.error(e.message || '退还失败'),
  })

  const busyId =
    (retryMut.isPending && retryMut.variables) ||
    (pauseMut.isPending && pauseMut.variables) ||
    (refundMut.isPending && refundMut.variables) ||
    null

  const bindActions = (r: GenerationJob) => ({
    onDetail: () => setDetailId(r.id),
    onPause: () => {
      if (confirm('确认暂停该任务？')) pauseMut.mutate(r.id)
    },
    onRetry: () => {
      if (confirm('确认用原参数重新入队？')) retryMut.mutate(r.id)
    },
    onRefund: () => {
      if (
        confirm(
          `确认取消任务并退还冻结积分（当前冻结 ${r.creditsFrozen ?? 0}）？已完成任务不可退，且不可重复退款。`,
        )
      ) {
        refundMut.mutate(r.id)
      }
    },
  })

  const columns: Column<GenerationJob>[] = [
    {
      key: 'id',
      header: 'ID',
      cell: (r) => <span className="font-mono text-xs text-muted">{r.id.slice(0, 8)}</span>,
    },
    { key: 'user', header: '用户', cell: (r) => r.userNickname || '未知用户' },
    {
      key: 'type',
      header: '类型',
      cell: (r) => JOB_TYPE_LABEL[r.jobType] ?? r.jobType,
    },
    {
      key: 'status',
      header: '状态',
      cell: (r) => (
        <Tag tone={(statusTone(r.status) ?? 'gray') as TagTone}>{STATUS_ZH[r.status] || r.status}</Tag>
      ),
    },
    {
      key: 'credits',
      header: '积分',
      cell: (r) => (
        <span className="text-xs text-muted">
          冻 {r.creditsFrozen ?? 0} / 消 {r.creditsConsumed ?? 0}
        </span>
      ),
    },
    { key: 'duration', header: '耗时', cell: (r) => <span className="text-muted">{fmtDuration(r)}</span> },
    {
      key: 'createdAt',
      header: '创建时间',
      cell: (r) => <span className="whitespace-nowrap text-xs text-muted">{fmtTime(r.createdAt)}</span>,
    },
    {
      key: 'op',
      header: '操作',
      cell: (r) => <JobActions job={r} busyId={busyId} {...bindActions(r)} />,
    },
  ]

  const detail = detailQ.data

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="生成任务队列"
        desc="按时间展示全部任务状态；支持暂停、查看返回数据、失败重试、手动退还冻结积分。"
      />

      {isError && (
        <div className="flex items-center gap-2 rounded-btn border border-red/30 bg-red/8 px-4 py-3 text-sm text-red">
          <AlertTriangle size={15} /> 任务列表加载失败，请稍后重试。
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex max-w-full flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                setFilter(f)
                setPage(1)
              }}
              className={cn('pill-tag shrink-0', filter === f && 'active')}
            >
              {f === '全部' ? '全部' : STATUS_ZH[f] || f}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <button
            type="button"
            className="btn-secondary !h-8 text-xs"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            上一页
          </button>
          <span className="text-xs text-muted sm:text-sm">
            第 {page} / {totalPages} 页 · 共 {total}
          </span>
          <button
            type="button"
            className="btn-secondary !h-8 text-xs"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            下一页
          </button>
        </div>
      </div>

      {/* 移动：卡片列表，操作全可见 */}
      <div className="space-y-2 md:hidden">
        {isFetching && jobs.length === 0 ? (
          <div className="flex justify-center py-12 text-muted">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : jobs.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">无匹配任务</p>
        ) : (
          jobs.map((job) => (
            <JobCard key={job.id} job={job} busyId={busyId} {...bindActions(job)} />
          ))
        )}
      </div>

      {/* 桌面：表格 */}
      <div className="hidden md:block">
        <DataTable columns={columns} data={jobs} loading={isFetching} rowKey={(r) => r.id} emptyText="无匹配任务" />
      </div>

      <Dialog
        open={!!detailId}
        onOpenChange={(o) => !o && setDetailId(null)}
        title="任务返回数据"
        description={detailId ? `任务 ${detailId.slice(0, 12)}…` : undefined}
        className="max-w-2xl"
      >
        {detailQ.isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted" />
          </div>
        ) : detailQ.isError ? (
          <p className="text-sm text-amber">
            {detailQ.error instanceof Error ? detailQ.error.message : '加载失败'}
          </p>
        ) : detail ? (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2 text-xs text-muted">
              <Tag tone={(statusTone(detail.status) ?? 'gray') as TagTone}>
                {STATUS_ZH[detail.status] || detail.status}
              </Tag>
              <span>冻结 {detail.creditsFrozen ?? 0}</span>
              <span>已消费 {detail.creditsConsumed ?? 0}</span>
            </div>
            {detail.errorMessage ? (
              <p className="rounded-btn border border-red/30 bg-red/8 px-3 py-2 text-xs text-red">{detail.errorMessage}</p>
            ) : null}
            <div>
              <p className="mb-1 text-xs font-medium text-muted">responseJson</p>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-btn bg-panel-2 p-3 text-[11px] leading-relaxed">
                {detail.responseJson != null
                  ? JSON.stringify(detail.responseJson, null, 2)
                  : '（无返回数据）'}
              </pre>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted">提示词 / 请求摘要</p>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-btn bg-panel-2 p-3 text-[11px]">
                {detail.prompt || '—'}
              </pre>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  )
}
