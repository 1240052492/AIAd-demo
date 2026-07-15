import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import {
  Home,
  FolderKanban,
  Paintbrush,
  Download,
  Headphones,
  Crown,
  Gift,
  LogOut,
  Settings,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { useAuthStore } from '@/stores'
import { useCreditStore } from '@/stores'
import { Dialog } from '@/components/ui/Dialog'
import { MembershipModal } from '@/pages/Membership'
import { PointsDetail } from '@/pages/Membership/PointsDetail'
import { Profile } from '@/pages/Membership/Profile'

/** 顶部导航项 */
const TOP_NAV = [
  { label: '首页生成', to: '/' },
  { label: '模板库', to: '/templates' },
  { label: '提示词库', to: '/prompts' },
  { label: '工作流库', to: '/workflows' },
  { label: '个人中心', to: '/account' },
]

/** 左侧 Rail 导航项 */
const RAIL_NAV = [
  { label: '首页', to: '/', icon: Home },
  { label: '项目', to: '/projects', icon: FolderKanban },
  { label: '画布', to: '/editor', icon: Paintbrush },
  { label: '导出', to: '/export', icon: Download },
  { label: '客服', to: '/support', icon: Headphones },
]

/** 渐变 Logo 图标 */
function LogoMark() {
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-card bg-gradient-to-br from-blue to-[#7cc7ff] text-lg font-extrabold text-[#07121d] shadow-lg shadow-blue/25">
      A
    </div>
  )
}

/** 头像组件 */
function Avatar({ name }: { name?: string }) {
  const initial = (name || 'A').trim().charAt(0).toUpperCase() || 'A'
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue to-[#7cc7ff] text-xs font-bold text-[#07121d]">
      {initial}
    </div>
  )
}

function getRoleCodes(user: ReturnType<typeof useAuthStore.getState>['user']): string[] {
  if (!user) return []
  const fromRoles = Array.isArray(user.roles)
    ? user.roles.map((item) => item.role?.code).filter((code): code is string => Boolean(code))
    : []
  return user.role ? Array.from(new Set([...fromRoles, user.role])) : fromRoles
}

export default function MainLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  const logout = useAuthStore((s) => s.logout)
  const balance = useCreditStore((s) => s.balance)
  const isAdmin = getRoleCodes(user).includes('admin')
  const isAdminRoute = location.pathname.startsWith('/admin')
  const [modal, setModal] = useState<null | 'membership' | 'credits' | 'profile'>(null)

  // 判断 Rail 是否高亮：根据当前路径前缀匹配
  const isRailActive = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)

  return (
    <div className="flex h-screen w-full overflow-hidden bg-bg text-text">
      {/* 左侧 Rail（后台路由下隐藏用户端导航） */}
      {!isAdminRoute && (
      <aside className="flex w-[82px] shrink-0 flex-col items-center border-r border-border bg-panel/60 py-4">
        <NavLink to="/" className="mb-6" aria-label="首页">
          <LogoMark />
        </NavLink>

        <nav className="flex flex-1 flex-col items-center gap-1">
          {RAIL_NAV.map((item) => {
            const Icon = item.icon
            const active = isRailActive(item.to)
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={cn(
                  'group flex w-[58px] flex-col items-center gap-1 rounded-card py-2 text-[11px] transition-all duration-150',
                  active
                    ? 'bg-white/10 text-text'
                    : 'text-muted hover:bg-white/5 hover:text-text',
                )}
              >
                <Icon
                  className={cn('h-5 w-5', active ? 'text-blue' : 'text-muted group-hover:text-text')}
                  strokeWidth={1.8}
                />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>
      </aside>
      )}

      {/* 主区域 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 顶部导航栏 */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-panel/40 px-5">
          {/* 左：Logo 文案 */}
          <div className="flex items-center gap-2">
            <span className="hidden text-[15px] font-semibold tracking-tight sm:inline">
              AdCraft AI <span className="text-muted">广告工作台</span>
            </span>
          </div>

          {/* 中：导航 */}
          <nav className="hidden items-center gap-1 md:flex">
            {[...TOP_NAV, ...(isAdmin ? [{ label: '数据总览', to: '/dashboard' }] : [])].map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'rounded-pill px-3 py-1.5 text-sm transition-all duration-150',
                    isActive
                      ? 'bg-white/10 text-text'
                      : 'text-muted hover:bg-white/5 hover:text-text',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* 右：会员 / 积分 / 头像 */}
          <div className="flex items-center gap-2">
            {isAdmin && !isAdminRoute && (
              <button
                type="button"
                onClick={() => navigate('/admin')}
                className="hidden items-center gap-1.5 rounded-pill bg-blue/15 px-3 py-1.5 text-sm font-medium text-blue transition-all hover:bg-blue/25 lg:inline-flex"
              >
                <Settings className="h-4 w-4" />
                系统管理
              </button>
            )}
            <button
              type="button"
              onClick={() => setModal('membership')}
              className="hidden items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm text-muted transition-all hover:bg-white/5 hover:text-text lg:inline-flex"
            >
              <Crown className="h-4 w-4 text-amber" />
              会员中心
            </button>
            <button
              type="button"
              onClick={() => setModal('credits')}
              className="hidden items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm text-muted transition-all hover:bg-white/5 hover:text-text lg:inline-flex"
            >
              <Gift className="h-4 w-4 text-amber" />
              积分总览
            </button>

            <div className="credit-badge font-semibold">
              <span className="text-amber">积分</span>
              <span className="ml-1 tabular-nums">{balance.toLocaleString()}</span>
            </div>

            <div className="ml-1 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setModal('profile')}
                title="个人中心"
                className="rounded-full transition-all hover:ring-2 hover:ring-blue/50"
              >
                <Avatar name={user?.nickname || user?.phone || user?.email} />
              </button>
              {token && (
                <button
                  type="button"
                  onClick={() => {
                    logout()
                    navigate('/login')
                  }}
                  title="退出登录"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/5 hover:text-red"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </header>

        {/* 主内容 */}
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* 弹框：会员中心 / 积分总览 / 个人中心 */}
      <MembershipModal open={modal === 'membership'} onClose={() => setModal(null)} />
      <Dialog
        open={modal === 'credits'}
        onOpenChange={(o) => !o && setModal(null)}
        title="积分总览"
        description="积分余额、消费与流水概览"
        className="max-w-2xl"
      >
        <PointsDetail compact />
      </Dialog>
      <Dialog
        open={modal === 'profile'}
        onOpenChange={(o) => !o && setModal(null)}
        title="个人中心"
        className="max-w-md"
      >
        <Profile compact />
      </Dialog>

      <Toaster richColors position="top-center" />
    </div>
  )
}
