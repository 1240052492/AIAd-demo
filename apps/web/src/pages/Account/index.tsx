import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, CreditCard, Crown, LogOut, Coins, Gift } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/utils/cn'
import { useAuthStore, useCreditStore } from '@/stores'
import { Profile } from '@/pages/Membership/Profile'
import { PointsDetail } from '@/pages/Membership/PointsDetail'
import { MembershipModal } from '@/pages/Membership'

/** 取用户的角色标识（兼容 role 字符串与 roles 关联数组），逻辑参考 MainLayout 的 getRoleCodes */
function getRoleCodes(user: ReturnType<typeof useAuthStore.getState>['user']): string[] {
  if (!user) return []
  const fromRoles = Array.isArray(user.roles)
    ? user.roles.map((item) => item.role?.code).filter((code): code is string => Boolean(code))
    : []
  return user.role ? Array.from(new Set([...fromRoles, user.role])) : fromRoles
}

/** 生成角色标签（code + 中文名） */
function getRoleTags(user: ReturnType<typeof useAuthStore.getState>['user']) {
  if (!user) return [] as { code: string; label: string }[]
  const tags: { code: string; label: string }[] = []
  if (Array.isArray(user.roles)) {
    for (const item of user.roles) {
      const code = item.role?.code
      if (code && !tags.some((t) => t.code === code)) {
        tags.push({ code, label: item.role?.name || code })
      }
    }
  }
  if (user.role && !tags.some((t) => t.code === user.role)) {
    const label =
      user.role === 'admin' ? '管理员' : user.role === 'user' ? '普通用户' : user.role
    tags.push({ code: user.role, label })
  }
  return tags
}

/** 头像：昵称/手机/邮箱首字母 + 渐变圆形（与主布局 Avatar 同款样式） */
function Avatar({ name, size = 'h-16 w-16 text-xl' }: { name?: string; size?: string }) {
  const initial = (name || 'A').trim().charAt(0).toUpperCase() || 'A'
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue to-[#7cc7ff] font-bold text-[#07121d]',
        size,
      )}
    >
      {initial}
    </div>
  )
}

function Card({
  icon,
  title,
  extra,
  children,
  className,
}: {
  icon: ReactNode
  title: string
  extra?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'rounded-card border border-border bg-panel p-5',
        className,
      )}
    >
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-blue">{icon}</span>
          <h2 className="text-sm font-semibold text-text">{title}</h2>
        </div>
        {extra}
      </header>
      {children}
    </section>
  )
}

export default function AccountPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  const balance = useCreditStore((s) => s.balance)
  const isAdmin = getRoleCodes(user).includes('admin')

  const [membershipOpen, setMembershipOpen] = useState(false)

  const roleTags = getRoleTags(user)
  const displayName = user?.nickname || user?.phone || user?.email || '未登录用户'
  const contact = user?.phone || user?.email || '未绑定'

  const handleLogout = () => {
    useAuthStore.getState().logout()
    toast.success('已退出登录')
    navigate('/login')
  }

  return (
    <div className="min-h-full bg-bg text-text">
      <div className="mx-auto max-w-[880px] px-6 py-6">
        {/* 顶部标题 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-text">个人中心</h1>
          <p className="mt-1 text-sm text-muted">管理你的账户资料、积分余额与会员权益</p>
        </div>

        <div className="space-y-5">
          {/* 用户信息卡 */}
          <Card icon={<User size={16} />} title="账户信息">
            <div className="flex items-center gap-4">
              <Avatar name={displayName} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-lg font-semibold text-text">{user?.nickname || '未命名用户'}</p>
                  {isAdmin && (
                    <span className="rounded-pill bg-blue/15 px-2 py-0.5 text-xs font-medium text-blue">
                      管理员
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-sm text-muted">{contact}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {roleTags.length > 0 ? (
                    roleTags.map((t) => (
                      <span
                        key={t.code}
                        className="rounded-pill bg-white/5 px-2.5 py-0.5 text-xs text-muted"
                      >
                        {t.label}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-muted">暂无角色</span>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* 积分总览区 */}
          <Card
            icon={<Coins size={16} />}
            title="积分总览"
            extra={
              <span className="flex items-center gap-1 text-sm">
                <span className="text-muted">当前积分</span>
                <span className="font-semibold tabular-nums text-amber">
                  {balance.toLocaleString()}
                </span>
              </span>
            }
          >
            <PointsDetail compact />
          </Card>

          {/* 会员中心区 */}
          <Card icon={<Crown size={16} />} title="会员中心">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-card bg-gradient-to-br from-blue to-[#7cc7ff] text-[#07121d]">
                  <Crown size={20} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text">会员权益与套餐</p>
                  <p className="text-xs text-muted">
                    {isAdmin ? '管理员账户享专属权益' : '开通会员解锁更多 AI 生成权益与积分赠送'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMembershipOpen(true)}
                className="btn-primary flex items-center justify-center gap-2"
              >
                <Gift size={16} />
                查看会员权益 / 升级会员
              </button>
            </div>
          </Card>

          {/* 账户设置区 */}
          <Card icon={<CreditCard size={16} />} title="账户设置">
            <Profile compact />
          </Card>

          {/* 退出登录 */}
          <button
            type="button"
            onClick={handleLogout}
            disabled={!token}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-card border border-border bg-panel px-4 py-3 text-sm font-medium text-muted transition-all hover:border-red/40 hover:text-red',
              !token && 'cursor-not-allowed opacity-50',
            )}
          >
            <LogOut size={16} />
            退出登录
          </button>
        </div>
      </div>

      <MembershipModal open={membershipOpen} onClose={() => setMembershipOpen(false)} />
    </div>
  )
}
