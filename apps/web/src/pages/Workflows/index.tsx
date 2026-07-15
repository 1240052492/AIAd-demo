import {
  Workflow,
  ClipboardList,
  Compass,
  Lightbulb,
  PenLine,
  Palette,
  ShieldCheck,
  ArrowRight,
  ChevronDown,
  Sparkles,
  CheckCircle2,
  Users,
  type LucideIcon,
  Play,
  Loader2,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { aiApi, capabilityApi, projectApi } from '@/services/api'

type WorkflowStep = {
  id: number
  name: string
  role: string
  duty: string
  icon: LucideIcon
  highlight?: boolean
  note?: string
}

const STEPS: WorkflowStep[] = [
  {
    id: 1,
    name: 'AE需求',
    role: '客户执行 (AE)',
    duty: '对接客户、收集与确认需求、整理 brief。',
    icon: ClipboardList,
  },
  {
    id: 2,
    name: '策略',
    role: '策略',
    duty: '基于需求做市场/受众分析，确定定位与传播策略。',
    icon: Compass,
  },
  {
    id: 3,
    name: '创意',
    role: '创意',
    duty: '产出核心创意概念与表现方向。',
    icon: Lightbulb,
  },
  {
    id: 4,
    name: '文案',
    role: '文案',
    duty: '撰写广告语、标题、正文等文字内容。',
    icon: PenLine,
  },
  {
    id: 5,
    name: '视觉',
    role: '视觉设计',
    duty: '基于创意与文案做视觉设计，并使用 AI 生图生成效果图（MVP 为门头招牌效果图闭环）。',
    icon: Palette,
    highlight: true,
    note: '本步骤由神笔 AI 生图能力支撑',
  },
  {
    id: 6,
    name: 'BOSS复核',
    role: '老板 / 总监',
    duty: '终审把关，确认交付质量后输出。',
    icon: ShieldCheck,
  },
]

const ROLE_LEGEND = [
  { role: 'AE · 客户执行', desc: '需求入口，对接客户并整理 brief' },
  { role: '策略', desc: '定位与传播策略制定' },
  { role: '创意', desc: '核心创意概念与表现方向' },
  { role: '文案', desc: '广告语与正文撰写' },
  { role: '视觉设计', desc: '视觉落地 + AI 生图效果图' },
  { role: 'BOSS · 总监', desc: '终审把关，确认交付质量' },
]

function StepCard({ step, last }: { step: WorkflowStep; last: boolean }) {
  const Icon = step.icon
  return (
    <div className="flex flex-1 flex-col">
      {/* 卡片 */}
      <div
        className={cn(
          'relative flex flex-col gap-3 rounded-card border bg-panel p-5 transition-shadow',
          step.highlight
            ? 'border-blue/60 shadow-[0_0_0_3px_rgba(59,130,246,0.12)]'
            : 'border-border',
        )}
      >
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-pill text-sm font-bold',
              step.highlight
                ? 'bg-gradient-to-r from-blue to-[#7cc7ff] text-white'
                : 'bg-blue/10 text-blue',
            )}
          >
            {step.id}
          </span>
          <Icon
            className={cn('h-5 w-5', step.highlight ? 'text-blue' : 'text-muted')}
          />
          <h3 className="text-base font-semibold text-text">{step.name}</h3>
        </div>

        <span
          className={cn(
            'inline-flex w-fit items-center rounded-pill px-2.5 py-1 text-xs font-medium',
            step.highlight ? 'bg-blue/10 text-blue' : 'bg-bg text-muted',
          )}
        >
          {step.role}
        </span>

        <p className="text-sm leading-relaxed text-muted">{step.duty}</p>

        {step.highlight && step.note && (
          <div className="mt-1 flex items-center gap-2 rounded-pill bg-gradient-to-r from-blue/10 to-[#7cc7ff]/10 px-3 py-2">
            <Sparkles className="h-4 w-4 text-blue" />
            <span className="text-xs font-medium text-blue">{step.note}</span>
          </div>
        )}
      </div>

      {/* 连接箭头（仅横向显示，且非最后一步） */}
      {!last && (
        <div className="hidden items-center justify-center py-3 md:flex">
          <ArrowRight className="h-5 w-5 text-border" />
        </div>
      )}
    </div>
  )
}

function StepCardMobile({ step, last }: { step: WorkflowStep; last: boolean }) {
  const Icon = step.icon
  return (
    <div className="relative flex gap-4">
      {/* 左侧时间线 */}
      <div className="flex flex-col items-center">
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-pill text-sm font-bold',
            step.highlight
              ? 'bg-gradient-to-r from-blue to-[#7cc7ff] text-white'
              : 'bg-blue/10 text-blue',
          )}
        >
          {step.id}
        </span>
        {!last && <span className="mt-1 w-px flex-1 bg-border" />}
      </div>

      {/* 内容 */}
      <div
        className={cn(
          'mb-6 flex flex-1 flex-col gap-3 rounded-card border bg-panel p-5',
          step.highlight
            ? 'border-blue/60 shadow-[0_0_0_3px_rgba(59,130,246,0.12)]'
            : 'border-border',
        )}
      >
        <div className="flex items-center gap-3">
          <Icon
            className={cn('h-5 w-5', step.highlight ? 'text-blue' : 'text-muted')}
          />
          <h3 className="text-base font-semibold text-text">{step.name}</h3>
          <span
            className={cn(
              'ml-auto inline-flex items-center rounded-pill px-2.5 py-1 text-xs font-medium',
              step.highlight ? 'bg-blue/10 text-blue' : 'bg-bg text-muted',
            )}
          >
            {step.role}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-muted">{step.duty}</p>
        {step.highlight && step.note && (
          <div className="mt-1 flex items-center gap-2 rounded-pill bg-gradient-to-r from-blue/10 to-[#7cc7ff]/10 px-3 py-2">
            <Sparkles className="h-4 w-4 text-blue" />
            <span className="text-xs font-medium text-blue">{step.note}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default function WorkflowLibrary() {
  const [projectId, setProjectId] = useState('')
  const [userInput, setUserInput] = useState('')
  const [running, setRunning] = useState(false)
  const projects = useQuery({
    queryKey: ['projects', 'workflow'],
    queryFn: () => projectApi.list({ page: 1, pageSize: 50 }),
  })
  const capabilities = useQuery({ queryKey: ['capabilities'], queryFn: capabilityApi.get })
  const items = projects.data?.data.items ?? []
  const textAvailable = Boolean(capabilities.data?.data.textGeneration)

  useEffect(() => {
    if (!projectId && items[0]) setProjectId(items[0].id)
  }, [items, projectId])

  async function runWorkflow() {
    if (!projectId) return
    setRunning(true)
    try {
      await aiApi.runWorkflow(projectId, userInput)
      toast.success('工作流执行完成，可在项目任务历史中查看结果')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '工作流执行失败')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-6">
      {/* 顶部标题 */}
      <header className="mb-8">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-card bg-gradient-to-r from-blue to-[#7cc7ff] text-white">
            <Workflow className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-text">工作流库</h1>
            <p className="mt-1 text-sm text-muted">
              Agency 岗位协作流程引擎：从需求到交付的标准化 6 步
            </p>
          </div>
        </div>
      </header>

      <section className="mb-8 grid gap-3 border-y border-border py-5 md:grid-cols-[minmax(220px,0.8fr)_minmax(320px,1.4fr)_auto] md:items-end">
        <label>
          <span className="mb-1.5 block text-xs font-semibold text-muted">执行项目</span>
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="h-10 w-full rounded-card border border-border bg-bg px-3 text-sm">
            {items.length === 0 ? <option value="">暂无项目</option> : items.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1.5 block text-xs font-semibold text-muted">补充要求</span>
          <input value={userInput} onChange={(event) => setUserInput(event.target.value)} placeholder="可选：补充预算、交期或审核重点" className="h-10 w-full rounded-card border border-border bg-bg px-3 text-sm" />
        </label>
        <button type="button" onClick={runWorkflow} disabled={running || !projectId || !textAvailable} className="btn-primary h-10">
          {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
          {textAvailable ? '运行工作流' : '文本模型未配置'}
        </button>
      </section>

      {/* 桌面端：横向步骤条 */}
      <section className="hidden md:flex md:items-start md:gap-2">
        {STEPS.map((step, idx) => (
          <StepCard key={step.id} step={step} last={idx === STEPS.length - 1} />
        ))}
      </section>

      {/* 移动端：纵向时间线（用箭头提示向下流转） */}
      <section className="md:hidden">
        {STEPS.map((step, idx) => (
          <div key={step.id}>
            <StepCardMobile step={step} last={idx === STEPS.length - 1} />
            {!step.highlight && idx !== STEPS.length - 1 && (
              <div className="ml-5 flex items-center pb-2 text-border">
                <ChevronDown className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}
      </section>

      {/* 流程说明 */}
      <section className="mt-10 rounded-card border border-border bg-panel p-6">
        <div className="mb-4 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-blue" />
          <h2 className="text-lg font-semibold text-text">流程说明</h2>
        </div>
        <p className="text-sm leading-relaxed text-muted">
          该引擎通过「多人协作 + 终审」机制保障交付质量：需求由 AE
          单点入口收集，经策略、创意、文案、视觉依次专业分工，每一步均由对应岗位负责，
          最终由老板 / 总监统一终审把关，避免单点失误，确保从需求到交付的标准化与可追溯。
          其中「视觉」步骤由神笔 AI 生图能力支撑，可快速生成门头招牌等效果图，形成
          MVP 闭环。
        </p>
      </section>

      {/* 角色图例 */}
      <section className="mt-6 rounded-card border border-border bg-panel p-6">
        <div className="mb-4 flex items-center gap-2">
          <Users className="h-5 w-5 text-amber" />
          <h2 className="text-lg font-semibold text-text">角色图例</h2>
        </div>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ROLE_LEGEND.map((item) => (
            <li
              key={item.role}
              className="flex flex-col gap-1 rounded-pill border border-border bg-bg px-4 py-3"
            >
              <span className="text-sm font-medium text-text">{item.role}</span>
              <span className="text-xs text-muted">{item.desc}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
