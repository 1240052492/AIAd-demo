import { useQuery } from '@tanstack/react-query'
import { Activity, Users, Coins, AlertTriangle, Zap } from 'lucide-react'
import { StatCard } from '@/components/admin/StatCard'
import { DataTable, type Column } from '@/components/admin/DataTable'
import { Tag, statusTone } from '@/components/ui/Tag'

interface OverviewData {
  stats: { title: string; value: string; delta: string; trend: 'up' | 'down' | 'warning'; tone: 'green' | 'blue' | 'amber' | 'red' }[]
  providers: { module: string; config: string; status: string; desc: string }[]
}

// 演示数据：后端暂无 /admin/overview 接口，使用给定指标
const MOCK: OverviewData = {
  stats: [
    { title: '今日生成', value: '128', delta: '+18%', trend: 'up', tone: 'green' },
    { title: '活跃用户', value: '42', delta: '+9%', trend: 'up', tone: 'blue' },
    { title: '消耗积分', value: '3860', delta: '+22%', trend: 'up', tone: 'amber' },
    { title: '失败任务', value: '3', delta: '需处理', trend: 'warning', tone: 'red' },
  ],
  providers: [
    {
      module: 'Anthropic 聊天',
      config: 'ANTHROPIC_BASE_URL / MODEL',
      status: 'live',
      desc: '主聊天模型，用于 brief 整理与策略判断',
    },
    {
      module: 'GPT-image-2 生图',
      config: 'OPENAI_IMAGE_BASE_URL / MODEL',
      status: 'async',
      desc: '异步生图通道，门头 / 文化墙视觉生成',
    },
    {
      module: 'OpenAI 聊天',
      config: 'OPENAI_BASE_URL / MODEL',
      status: 'reserved',
      desc: '备用聊天模型，当前未启用',
    },
    {
      module: 'banana2',
      config: 'BANANA2_BASE_URL / MODEL',
      status: 'reserved',
      desc: '预留供应商，待接入',
    },
    {
      module: '积分规则',
      config: '生图、合成、导出、提示词',
      status: 'editable',
      desc: '可维护各项操作的积分消耗配置',
    },
  ],
}

const providerColumns: Column<OverviewData['providers'][number]>[] = [
  { key: 'module', header: '模块', cell: (r) => <span className="font-medium text-text">{r.module}</span> },
  { key: 'config', header: '配置项', cell: (r) => <code className="text-xs text-muted">{r.config}</code> },
  {
    key: 'status',
    header: '当前状态',
    cell: (r) => <Tag tone={statusTone(r.status)}>{r.status}</Tag>,
  },
  { key: 'desc', header: '说明', cell: (r) => <span className="text-muted">{r.desc}</span> },
]

export function Overview() {
  const { data } = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: async () => MOCK,
  })

  const d = data ?? MOCK

  return (
    <div className="space-y-6">
      <PageHeader title="数据总览" desc="平台运行核心指标与 Provider 接入状态" />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {d.stats.map((s) => (
          <StatCard
            key={s.title}
            title={s.title}
            value={s.value}
            delta={s.delta}
            trend={s.trend}
            tone={s.tone}
            icon={
              s.title === '今日生成' ? <Zap size={18} /> :
              s.title === '活跃用户' ? <Users size={18} /> :
              s.title === '消耗积分' ? <Coins size={18} /> :
              <AlertTriangle size={18} />
            }
          />
        ))}
      </div>

      <section className="panel-card">
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Activity size={15} className="text-blue" />
          <h2 className="text-sm font-semibold text-text">Provider 状态</h2>
        </header>
        <div className="p-2">
          <DataTable columns={providerColumns} data={d.providers} rowKey={(r) => r.module} />
        </div>
      </section>
    </div>
  )
}

export function PageHeader({ title, desc }: { title: string; desc?: string }) {
  return (
    <div>
      <h1 className="text-xl font-bold text-text">{title}</h1>
      {desc && <p className="mt-1 text-sm text-muted">{desc}</p>}
    </div>
  )
}
