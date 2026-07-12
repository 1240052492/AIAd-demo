import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, ChevronDown, Loader2 } from 'lucide-react'
import { DataTable, type Column } from '@/components/admin/DataTable'
import { Tag, type TagTone, statusTone } from '@/components/ui/Tag'
import { PageHeader } from './Overview'
import { cn } from '@/utils/cn'

interface QueueJob {
  id: string
  user: string
  provider: string
  model: string
  type: string
  status: string
  duration: string
  createdAt: string
  prompt: string
}

// 演示数据（后端暂无 /admin/queue 接口）
const MOCK: QueueJob[] = [
  { id: 'q1', user: '张设计', provider: 'gpt-image-2', model: 'gpt-image-2', type: 'image_generation', status: 'succeeded', duration: '8.2s', createdAt: '2025-12-12 10:01', prompt: '发光字门头，蓝色科技感，夜晚街道' },
  { id: 'q2', user: '李广告', provider: 'anthropic', model: 'claude-3-5-sonnet', type: 'brief', status: 'succeeded', duration: '2.1s', createdAt: '2025-12-12 10:03', prompt: '整理客户门头招牌需求' },
  { id: 'q3', user: '王制作', provider: 'gpt-image-2', model: 'gpt-image-2', type: 'composition', status: 'failed', duration: '—', createdAt: '2025-12-12 10:05', prompt: '将设计稿合成到门店环境' },
  { id: 'q4', user: '陈运营', provider: 'gpt-image-2', model: 'gpt-image-2', type: 'image_generation', status: 'processing', duration: '进行中', createdAt: '2025-12-12 10:07', prompt: '企业文化墙展板，简约风格' },
  { id: 'q5', user: '刘策划', provider: 'anthropic', model: 'claude-3-5-sonnet', type: 'prompt', status: 'queued', duration: '—', createdAt: '2025-12-12 10:08', prompt: '生成 3 条创意方向' },
]

const FILTERS = ['全部', 'succeeded', 'processing', 'failed', 'queued']

export function TaskQueue() {
  const { data, isFetching } = useQuery({ queryKey: ['admin', 'queue'], queryFn: async () => MOCK })
  const [filter, setFilter] = useState('全部')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [retrying, setRetrying] = useState<string | null>(null)

  const jobs = (data ?? []).filter((j) => filter === '全部' || j.status === filter)
  const jobTypeLabel: Record<string, string> = {
    brief: '需求整理',
    prompt: '提示词生成',
    image_generation: '视觉生图',
    composition: '环境合成',
    export: '导出输出',
  }

  const retry = (id: string) => {
    setRetrying(id)
    // 演示：实际应调用重试接口
    setTimeout(() => setRetrying(null), 1200)
  }

  const columns: Column<QueueJob>[] = [
    { key: 'id', header: 'ID', cell: (r) => <span className="font-mono text-xs text-muted">{r.id}</span> },
    { key: 'user', header: '用户', cell: (r) => r.user },
    { key: 'provider', header: 'Provider', cell: (r) => <span className="text-muted">{r.provider}</span> },
    { key: 'model', header: '模型', cell: (r) => <span className="text-muted">{r.model}</span> },
    { key: 'type', header: '类型', cell: (r) => jobTypeLabel[r.type] ?? r.type },
    { key: 'status', header: '状态', cell: (r) => <Tag tone={statusTone(r.status)}>{r.status}</Tag> },
    { key: 'duration', header: '耗时', cell: (r) => <span className="text-muted">{r.duration}</span> },
    { key: 'createdAt', header: '创建时间', cell: (r) => <span className="text-muted">{r.createdAt}</span> },
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
              disabled={retrying === r.id}
              onClick={(e) => {
                e.stopPropagation()
                retry(r.id)
              }}
            >
              {retrying === r.id ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              重试
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader title="生成任务队列" desc="查看实时生成任务、重试失败任务" />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={cn('pill-tag', filter === f && 'active')}>
            {f === '全部' ? '全部' : f}
          </button>
        ))}
      </div>

      <DataTable columns={columns} data={jobs} loading={isFetching} rowKey={(r) => r.id} emptyText="无匹配任务" />

      {expanded && (
        <div className="panel-card p-4">
          <p className="mb-1 text-sm font-medium text-muted">任务提示词</p>
          <pre className="whitespace-pre-wrap rounded-btn bg-panel-2 p-3 text-xs leading-relaxed text-text/90">
            {jobs.find((j) => j.id === expanded)?.prompt ?? '—'}
          </pre>
        </div>
      )}
    </div>
  )
}
