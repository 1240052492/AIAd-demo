import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores'
import {
  LayoutDashboard,
  Users,
  Coins,
  Library,
  Workflow,
  Cpu,
  ListChecks,
  LayoutGrid,
  ShieldAlert,
  ArrowLeft,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { Overview } from './Overview'
import { UsersPanel } from './Users'
import { CreditRules } from './CreditRules'
import { TemplatesPanel } from './Templates'
import { WorkflowPanel } from './Workflow'
import { ProvidersPanel } from './Providers'
import { TaskQueue } from './TaskQueue'
import { SystemLayoutPanel } from './SystemLayout'

type TabKey =
  | 'overview'
  | 'users'
  | 'credits'
  | 'templates'
  | 'workflow'
  | 'providers'
  | 'queue'
  | 'layout'

const NAV: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: '数据总览', icon: <LayoutDashboard size={17} /> },
  { key: 'users', label: '用户与权限', icon: <Users size={17} /> },
  { key: 'credits', label: '积分规则', icon: <Coins size={17} /> },
  { key: 'templates', label: '模板 / 提示词库', icon: <Library size={17} /> },
  { key: 'workflow', label: '工作流配置', icon: <Workflow size={17} /> },
  { key: 'providers', label: '模型供应商', icon: <Cpu size={17} /> },
  { key: 'queue', label: '生成任务队列', icon: <ListChecks size={17} /> },
  { key: 'layout', label: '系统布局', icon: <LayoutGrid size={17} /> },
]

export default function AdminPage() {
  const [tab, setTab] = useState<TabKey>('overview')
  const { user } = useAuthStore()
  const navigate = useNavigate()

  // 简单的路由权限判断：仅 admin 角色可访问
  const isAdmin = user?.role === 'admin'
  const bypass = localStorage.getItem('adcraft_admin_bypass') === '1'
  const allowed = isAdmin || bypass

  if (!allowed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
        <ShieldAlert size={42} className="text-amber" />
        <div>
          <h1 className="text-lg font-semibold text-text">无后台访问权限</h1>
          <p className="mt-1 text-sm text-muted">
            当前账号（{user?.nickname ?? user?.phone ?? '未登录'}）不是管理员，无法进入后台管理。
          </p>
        </div>
        <div className="flex gap-3">
          <button className="btn-secondary" onClick={() => navigate('/')}>
            <ArrowLeft size={15} /> 返回首页
          </button>
          {/* 本地演示入口：无后端 admin 接口时用于预览后台界面 */}
          <button
            className="btn-primary"
            onClick={() => {
              localStorage.setItem('adcraft_admin_bypass', '1')
              location.reload()
            }}
          >
            以管理员身份进入（本地演示）
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-bg">
      {/* 左侧导航 230px */}
      <aside className="flex w-[230px] shrink-0 flex-col border-r border-border bg-panel/60">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-btn bg-gradient-to-r from-blue to-[#7cc7ff] text-[#07121d]">
            <LayoutDashboard size={16} />
          </span>
          <div>
            <p className="text-sm font-semibold text-text">AdCraft 后台</p>
            <p className="text-[11px] text-muted">管理控制台</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={cn(
                'flex w-full items-center gap-3 rounded-btn px-3 py-2.5 text-sm transition-colors',
                tab === item.key
                  ? 'bg-blue/15 text-blue'
                  : 'text-muted hover:bg-white/5 hover:text-text',
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <button onClick={() => navigate('/')} className="btn-secondary w-full !h-8 text-xs">
            <ArrowLeft size={14} /> 返回工作台
          </button>
        </div>
      </aside>

      {/* 右侧主内容 */}
      <main className="admin-main min-w-0 flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-[1200px] px-6 py-6">
          {tab === 'overview' && <Overview />}
          {tab === 'users' && <UsersPanel />}
          {tab === 'credits' && <CreditRules />}
          {tab === 'templates' && <TemplatesPanel />}
          {tab === 'workflow' && <WorkflowPanel />}
          {tab === 'providers' && <ProvidersPanel />}
          {tab === 'queue' && <TaskQueue />}
          {tab === 'layout' && <SystemLayoutPanel />}
        </div>
      </main>
    </div>
  )
}
