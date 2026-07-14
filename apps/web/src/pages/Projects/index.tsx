import { useParams, useNavigate, Link } from 'react-router-dom'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Plus,
  ArrowRight,
  Clock,
  FileText,
  Images,
  History,
  Edit3,
  Loader2,
  ArrowLeft,
} from 'lucide-react'
import { projectApi, creditApi } from '@/services/api'
import { BUSINESS_TYPES, type Project, type CreditTransaction, type GenerationJob } from '@/types'
import { cn } from '@/utils/cn'
import { Tag, type TagTone } from '@/components/ui/Tag'
import { Dialog } from '@/components/ui/Dialog'

const BUSINESS_LABEL: Record<string, string> = Object.fromEntries(
  BUSINESS_TYPES.map((b) => [b.key, b.label]),
)

/** 项目状态 -> 标签文案与配色 */
const PROJECT_STATUS: Record<Project['status'], { label: string; tone: TagTone }> = {
  draft: { label: '草稿', tone: 'gray' },
  generating: { label: '生成中', tone: 'blue' },
  editing: { label: '编辑中', tone: 'blue' },
  completed: { label: '已完成', tone: 'amber' },
  exported: { label: '已导出', tone: 'green' },
}

/** 积分流水类型 -> 文案 */
const CREDIT_TYPE_LABEL: Record<string, string> = {
  register_bonus: '注册送积分',
  consume: '生图 / 合成消耗',
  refund: '退款',
  admin_adjust: '管理员调整',
}

/** 模板统计（右侧栏，来源于后台配置） */
const TEMPLATE_STATS = [
  { key: 'storefront', title: '门头招牌', count: 36, desc: '发光字、底板、灯箱等门头类模板' },
  { key: 'culture', title: '文化墙', count: 18, desc: '企业文化墙、展板、美陈设计模板' },
  { key: 'material', title: '物料输出', count: 24, desc: '海报、喷绘、易拉宝等广告物料' },
]

function fmtTime(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const now = Date.now()
  const diff = now - d.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} 小时前`
  const day = Math.floor(h / 24)
  if (day < 30) return `${day} 天前`
  return d.toLocaleDateString('zh-CN')
}

export default function ProjectsPage() {
  const { id } = useParams()
  if (id) return <ProjectDetail id={id} />
  return <ProjectCenter />
}

/* ============================ 项目中心（三栏） ============================ */
function ProjectCenter() {
  const navigate = useNavigate()

  const { data: projRes, isLoading: projLoading } = useQuery({
    queryKey: ['projects', 'recent'],
    queryFn: () => projectApi.list({ page: 1, pageSize: 12 }),
  })
  const { data: creditRes, isLoading: creditLoading } = useQuery({
    queryKey: ['credits', 'recent'],
    queryFn: () => creditApi.transactions({ page: 1, pageSize: 10 }),
  })

  const projects = projRes?.data.items ?? []
  const transactions = creditRes?.data.items ?? []

  const [showAllTx, setShowAllTx] = useState(false)
  const { data: allTxRes, isLoading: allTxLoading } = useQuery({
    queryKey: ['credits', 'all-dialog'],
    queryFn: () => creditApi.transactions({ page: 1, pageSize: 50 }),
    enabled: showAllTx,
  })
  const allTx = allTxRes?.data.items ?? []

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold text-text">项目中心</h1>
          <p className="mt-1 text-sm text-muted">管理你的客户项目、积分消耗与广告流程模板</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* 左栏：最近客户项目 */}
        <section className="panel-card flex flex-col lg:col-span-5">
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-text">最近客户项目</h2>
            <button className="btn-primary h-8 !px-3 text-xs" onClick={() => navigate('/projects/new')}>
              <Plus size={14} /> 新建项目
            </button>
          </header>
          <div className="flex-1 space-y-1 p-2">
            {projLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between px-2 py-3">
                  <div className="space-y-2">
                    <div className="h-4 w-40 animate-pulse rounded bg-white/8" />
                    <div className="h-3 w-24 animate-pulse rounded bg-white/8" />
                  </div>
                  <div className="h-6 w-16 animate-pulse rounded-pill bg-white/8" />
                </div>
              ))
            ) : projects.length === 0 ? (
              <p className="px-2 py-10 text-center text-sm text-muted">还没有项目，点击「新建项目」开始</p>
            ) : (
              projects.map((p) => {
                const st = PROJECT_STATUS[p.status]
                return (
                  <Link
                    key={p.id}
                    to={`/projects/${p.id}`}
                    className="group flex items-center justify-between rounded-pill px-2 py-2.5 transition-colors hover:bg-white/5"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-text">{p.title}</span>
                        <span className="shrink-0 rounded bg-white/8 px-1.5 py-0.5 text-[10px] text-muted">
                          {BUSINESS_LABEL[p.businessType] ?? p.businessType}
                        </span>
                      </div>
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                        <Clock size={11} /> {fmtTime(p.updatedAt)}
                      </span>
                    </div>
                    <Tag tone={st.tone}>{st.label}</Tag>
                  </Link>
                )
              })
            )}
          </div>
        </section>

        {/* 中栏：积分消耗 */}
        <section className="panel-card flex flex-col lg:col-span-4">
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-text">积分消耗</h2>
            <button
              className="flex items-center gap-0.5 text-xs text-blue hover:underline"
              onClick={() => setShowAllTx(true)}
            >
              查看全部 <ArrowRight size={12} />
            </button>
          </header>
          <div className="flex-1 space-y-1 p-2">
            {creditLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between px-2 py-2.5">
                  <div className="space-y-2">
                    <div className="h-4 w-32 animate-pulse rounded bg-white/8" />
                    <div className="h-3 w-20 animate-pulse rounded bg-white/8" />
                  </div>
                  <div className="h-6 w-14 animate-pulse rounded-pill bg-white/8" />
                </div>
              ))
            ) : transactions.length === 0 ? (
              <p className="px-2 py-10 text-center text-sm text-muted">暂无积分流水</p>
            ) : (
              transactions.map((t: CreditTransaction) => {
                const positive = t.amount >= 0
                return (
                  <div
                    key={t.id}
                    className="flex items-center justify-between rounded-pill px-2 py-2.5 transition-colors hover:bg-white/5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-text">
                        {CREDIT_TYPE_LABEL[t.type] ?? t.type}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted">{t.reason ?? fmtTime(t.createdAt)}</p>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded-pill border px-2.5 py-1 text-xs font-semibold',
                        positive
                          ? 'border-green/45 bg-green/12 text-green'
                          : 'border-orange-400/45 bg-orange-400/12 text-orange-400',
                      )}
                    >
                      {positive ? `+${t.amount}` : t.amount}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </section>

        {/* 右栏：广告流程模板统计 */}
        <section className="panel-card flex flex-col lg:col-span-3">
          <header className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-text">广告流程模板</h2>
          </header>
          <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-1">
            {TEMPLATE_STATS.map((s) => (
              <div key={s.key} className="rounded-btn border border-border bg-panel-2/50 p-3">
                <p className="text-xs text-muted">{s.title}</p>
                <p className="mt-1 text-2xl font-bold text-text">
                  {s.count} <span className="text-sm font-normal text-muted">个模板</span>
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted/80">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* 本账号积分流水弹框：仅展示当前登录用户的积分消耗与变动，不再跳转后台 */}
      <Dialog
        open={showAllTx}
        onOpenChange={(o) => !o && setShowAllTx(false)}
        title="我的积分流水"
        description="仅展示本账号的积分消耗与变动记录"
        className="max-w-2xl"
      >
        <div className="max-h-[60vh] space-y-1 overflow-y-auto">
          {allTxLoading ? (
            <p className="py-10 text-center text-sm text-muted">加载中…</p>
          ) : allTx.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">暂无积分流水</p>
          ) : (
            allTx.map((t: CreditTransaction) => {
              const positive = t.amount >= 0
              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-pill px-2 py-2.5 transition-colors hover:bg-white/5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-text">
                      {CREDIT_TYPE_LABEL[t.type] ?? t.type}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted">{t.reason ?? fmtTime(t.createdAt)}</p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-pill border px-2.5 py-1 text-xs font-semibold',
                      positive
                        ? 'border-green/45 bg-green/12 text-green'
                        : 'border-orange-400/45 bg-orange-400/12 text-orange-400',
                    )}
                  >
                    {positive ? `+${t.amount}` : t.amount}
                  </span>
                </div>
              )
            })
          )}
        </div>
      </Dialog>
    </div>
  )
}

/* ============================ 项目详情 ============================ */
const JOB_TYPE_LABEL: Record<string, string> = {
  brief: '需求整理',
  prompt: '提示词生成',
  image_generation: '视觉生图',
  composition: '环境合成',
  export: '导出输出',
}
const JOB_STATUS_TONE: Record<string, TagTone> = {
  queued: 'gray',
  submitted: 'blue',
  processing: 'blue',
  succeeded: 'green',
  failed: 'red',
  canceled: 'gray',
}

/** 详情页示例数据：关联素材与生成任务历史（后端暂无对应接口，演示用） */
const MOCK_ASSETS = [
  { id: 'a1', type: 'upload_environment', name: '门店环境照.jpg', size: '2.4 MB' },
  { id: 'a2', type: 'generated_design', name: '门头设计_v1.png', size: '1.1 MB' },
  { id: 'a3', type: 'composited_preview', name: '合成预览.png', size: '880 KB' },
]
const MOCK_JOBS: GenerationJob[] = [
  {
    id: 'j1',
    provider: 'gpt-image-2',
    model: 'gpt-image-2',
    jobType: 'image_generation',
    status: 'succeeded',
    creditsFrozen: 12,
    creditsConsumed: 12,
    createdAt: new Date(Date.now() - 3600_000).toISOString(),
    finishedAt: new Date(Date.now() - 3500_000).toISOString(),
  },
  {
    id: 'j2',
    provider: 'anthropic',
    model: 'claude-3-5-sonnet',
    jobType: 'brief',
    status: 'succeeded',
    creditsFrozen: 2,
    creditsConsumed: 2,
    createdAt: new Date(Date.now() - 7200_000).toISOString(),
    finishedAt: new Date(Date.now() - 7150_000).toISOString(),
  },
  {
    id: 'j3',
    provider: 'gpt-image-2',
    model: 'gpt-image-2',
    jobType: 'composition',
    status: 'failed',
    creditsFrozen: 8,
    creditsConsumed: 0,
    createdAt: new Date(Date.now() - 1800_000).toISOString(),
  },
]

function ProjectDetail({ id }: { id: string }) {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectApi.detail(id),
  })
  const project = data?.data

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-6">
      <button
        onClick={() => navigate('/projects')}
        className="mb-4 flex items-center gap-1.5 text-sm text-muted hover:text-text"
      >
        <ArrowLeft size={15} /> 返回项目中心
      </button>

      {isLoading || !project ? (
        <div className="panel-card flex items-center justify-center gap-2 py-20 text-muted">
          <Loader2 size={18} className="animate-spin" /> 加载项目详情…
        </div>
      ) : (
        <div className="space-y-5">
          {/* 头部信息 */}
          <div className="panel-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-bold text-text">{project.title}</h1>
                  <Tag tone={PROJECT_STATUS[project.status].tone}>
                    {PROJECT_STATUS[project.status].label}
                  </Tag>
                </div>
                <p className="mt-2 text-sm text-muted">
                  业务类型：
                  <span className="text-text">
                    {BUSINESS_LABEL[project.businessType] ?? project.businessType}
                  </span>
                  <span className="mx-2 text-white/15">|</span>
                  创建于 {fmtTime(project.createdAt)}
                  <span className="mx-2 text-white/15">|</span>
                  更新于 {fmtTime(project.updatedAt)}
                </p>
              </div>
              <Link to={`/editor/${project.id}`} className="btn-primary">
                <Edit3 size={15} /> 进入编辑器
              </Link>
            </div>

            {project.briefJson && (
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-3">
                <BriefItem label="目标客群" value={project.briefJson.targetAudience} />
                <BriefItem label="视觉方向" value={project.briefJson.visualDirection} />
                <BriefItem label="店铺名称" value={project.briefJson.storeName} />
                <BriefItem label="行业" value={project.briefJson.industry} />
                <BriefItem label="风格" value={project.briefJson.style} />
                <BriefItem label="尺寸" value={project.briefJson.dimensions} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* 关联素材 */}
            <section className="panel-card">
              <header className="flex items-center gap-2 border-b border-border px-4 py-3">
                <Images size={15} className="text-blue" />
                <h2 className="text-sm font-semibold text-text">关联素材</h2>
              </header>
              <div className="divide-y divide-border">
                {MOCK_ASSETS.map((a) => (
                  <div key={a.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-btn bg-panel-2 text-muted">
                        <FileText size={16} />
                      </span>
                      <div>
                        <p className="text-sm font-medium text-text">{a.name}</p>
                        <p className="text-xs text-muted">{a.type}</p>
                      </div>
                    </div>
                    <span className="text-xs text-muted">{a.size}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* 生成任务历史 */}
            <section className="panel-card">
              <header className="flex items-center gap-2 border-b border-border px-4 py-3">
                <History size={15} className="text-blue" />
                <h2 className="text-sm font-semibold text-text">生成任务历史</h2>
              </header>
              <div className="divide-y divide-border">
                {MOCK_JOBS.map((j) => (
                  <div key={j.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-text">
                        {JOB_TYPE_LABEL[j.jobType] ?? j.jobType}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {j.provider} · 冻结 {j.creditsFrozen} 积分
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Tag tone={JOB_STATUS_TONE[j.status]}>{j.status}</Tag>
                      <span className="text-[11px] text-muted">{fmtTime(j.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  )
}

function BriefItem({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 truncate text-sm text-text">{value ?? '—'}</p>
    </div>
  )
}
