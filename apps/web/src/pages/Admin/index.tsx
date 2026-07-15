import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores'
import {
  LayoutDashboard,
  Users,
  Coins,
  Library,
  Workflow,
  ListChecks,
  LayoutGrid,
  ShieldAlert,
  ArrowLeft,
  Receipt,
  Crown,
  HandCoins,
  KeyRound,
  Menu,
  X,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { Overview } from './Overview'
import { CreditRules } from './CreditRules'
import { TemplatesPanel } from './Templates'
import { WorkflowPanel } from './Workflow'
import { ProvidersPanel } from './Providers'
import { TaskQueue } from './TaskQueue'
import { SystemLayoutPanel } from './SystemLayout'
import { RoleConfigPanel } from './RoleConfig'
import { MembershipMgmtPanel } from './MembershipMgmt'
import { RechargeMgmtPanel } from './RechargeMgmt'
import { UserRolesPanel } from './UserRoles'
import { CreditLedgerPanel } from './CreditLedger'

export type TabKey =
  | 'overview'
  | 'users'
  | 'credits'
  | 'ledger'
  | 'templates'
  | 'workflow'
  | 'providers'
  | 'queue'
  | 'layout'
  | 'roleconfig'
  | 'membership'
  | 'recharge'

const NAV: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: '数据总览', icon: <LayoutDashboard size={17} /> },
  { key: 'users', label: '用户与权限', icon: <Users size={17} /> },
  { key: 'credits', label: '积分规则', icon: <Coins size={17} /> },
  { key: 'ledger', label: '积分流水', icon: <Receipt size={17} /> },
  { key: 'membership', label: '会员套餐', icon: <Crown size={17} /> },
  { key: 'recharge', label: '充值管理', icon: <HandCoins size={17} /> },
  { key: 'templates', label: '模板库', icon: <Library size={17} /> },
  { key: 'workflow', label: '工作流配置', icon: <Workflow size={17} /> },
  { key: 'providers', label: 'API 配置 / 模型服务', icon: <KeyRound size={17} /> },
  { key: 'queue', label: '生成任务队列', icon: <ListChecks size={17} /> },
  { key: 'layout', label: '系统布局', icon: <LayoutGrid size={17} /> },
  { key: 'roleconfig', label: '角色权限配置', icon: <ShieldAlert size={17} /> },
]

const TAB_KEYS = new Set(NAV.map((n) => n.key))

function isAdminUser(user: ReturnType<typeof useAuthStore.getState>['user']): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  return !!user.roles?.some((r) => r?.role?.code === 'admin')
}

function AdminNav({
  tab,
  onNavigate,
  className,
}: {
  tab: TabKey
  onNavigate: (key: TabKey) => void
  className?: string
}) {
  return (
    <nav className={cn('space-y-1', className)}>
      {NAV.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onNavigate(item.key)}
          className={cn(
            'flex w-full items-center gap-3 rounded-btn px-3 py-2.5 text-left text-sm transition-colors',
            tab === item.key ? 'bg-blue/15 text-blue' : 'text-muted hover:bg-white/5 hover:text-text',
          )}
        >
          {item.icon}
          <span className="leading-snug">{item.label}</span>
        </button>
      ))}
    </nav>
  )
}

export default function AdminPage() {
  const { tab: tabParam } = useParams<{ tab?: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [menuOpen, setMenuOpen] = useState(false)

  const tab: TabKey = useMemo(() => {
    if (tabParam && TAB_KEYS.has(tabParam as TabKey)) return tabParam as TabKey
    if (tabParam === 'userroles') return 'users'
    return 'overview'
  }, [tabParam])

  const currentLabel = NAV.find((n) => n.key === tab)?.label || '数据总览'

  // 路由变化时关闭移动抽屉
  useEffect(() => {
    setMenuOpen(false)
  }, [tabParam])

  // 打开抽屉时锁 body 滚动
  useEffect(() => {
    if (!menuOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [menuOpen])

  if (tabParam && !TAB_KEYS.has(tabParam as TabKey) && tabParam !== 'userroles') {
    return <Navigate to="/admin/overview" replace />
  }
  if (!tabParam) {
    return <Navigate to="/admin/overview" replace />
  }

  if (!isAdminUser(user)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
        <ShieldAlert size={42} className="text-amber" />
        <div>
          <h1 className="text-lg font-semibold text-text">无后台访问权限</h1>
          <p className="mt-1 text-sm text-muted">
            当前账号（{user?.nickname ?? user?.phone ?? '未登录'}）不是管理员，无法进入后台管理。
          </p>
        </div>
        <button className="btn-secondary" onClick={() => navigate('/')}>
          <ArrowLeft size={15} /> 返回工作台
        </button>
      </div>
    )
  }

  const goTab = (key: TabKey) => {
    navigate(`/admin/${key}`)
    setMenuOpen(false)
  }

  return (
    <div className="flex min-h-screen min-w-0 bg-bg text-text">
      {/* 桌面侧栏 ≥768px */}
      <aside className="hidden w-[230px] shrink-0 flex-col border-r border-border bg-panel/60 md:flex">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-btn bg-gradient-to-r from-blue to-[#7cc7ff] text-[#07121d]">
            <LayoutDashboard size={16} />
          </span>
          <div>
            <p className="text-sm font-semibold text-text">AdCraft 管理后台</p>
            <p className="text-[11px] text-muted">纯管理控制台</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <AdminNav tab={tab} onNavigate={goTab} />
        </div>
        <div className="border-t border-border p-3">
          <button type="button" onClick={() => navigate('/')} className="btn-secondary w-full !h-9 text-xs">
            <ArrowLeft size={14} /> 返回工作台
          </button>
        </div>
      </aside>

      {/* 主列：移动占满宽 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 移动顶栏 <768px */}
        <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-panel/95 px-3 backdrop-blur md:hidden">
          <button
            type="button"
            aria-label="打开菜单"
            onClick={() => setMenuOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-btn text-text hover:bg-white/5"
          >
            <Menu size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">管理后台</p>
            <p className="truncate text-[11px] text-muted">{currentLabel}</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="shrink-0 rounded-btn border border-border px-2 py-1.5 text-[11px] text-muted hover:text-text"
          >
            工作台
          </button>
        </header>

        {/* 移动抽屉导航 */}
        {menuOpen ? (
          <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="后台导航">
            <button
              type="button"
              className="absolute inset-0 bg-black/55"
              aria-label="关闭菜单"
              onClick={() => setMenuOpen(false)}
            />
            <aside className="absolute inset-y-0 left-0 flex w-[min(280px,86vw)] flex-col border-r border-border bg-panel shadow-xl">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-btn bg-gradient-to-r from-blue to-[#7cc7ff] text-[#07121d]">
                    <LayoutDashboard size={16} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">AdCraft 管理后台</p>
                    <p className="text-[11px] text-muted">选择功能页</p>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="关闭"
                  onClick={() => setMenuOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-btn text-muted hover:bg-white/5 hover:text-text"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                <AdminNav tab={tab} onNavigate={goTab} />
              </div>
              <div className="border-t border-border p-3">
                <button type="button" onClick={() => navigate('/')} className="btn-secondary w-full !h-9 text-xs">
                  <ArrowLeft size={14} /> 返回工作台
                </button>
              </div>
            </aside>
          </div>
        ) : null}

        <main className="admin-main min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          <div className="mx-auto w-full max-w-[1200px] px-3 py-4 sm:px-6 sm:py-6">
            {tab === 'overview' && <Overview />}
            {tab === 'users' && <UserRolesPanel />}
            {tab === 'credits' && <CreditRules />}
            {tab === 'ledger' && <CreditLedgerPanel />}
            {tab === 'templates' && <TemplatesPanel />}
            {tab === 'workflow' && <WorkflowPanel />}
            {tab === 'providers' && <ProvidersPanel />}
            {tab === 'queue' && <TaskQueue />}
            {tab === 'layout' && <SystemLayoutPanel />}
            {tab === 'roleconfig' && <RoleConfigPanel />}
            {tab === 'membership' && <MembershipMgmtPanel />}
            {tab === 'recharge' && <RechargeMgmtPanel />}
          </div>
        </main>
      </div>
    </div>
  )
}
