import { User as UserIcon, Building2, UserRound, Mail, Phone, IdCard } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useAuthStore } from '@/stores'
import { useAccountSwitch, type AccountType } from '@/stores/accountSwitch'

function Field({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-card bg-panel/60 px-4 py-3">
      <span className="text-muted">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className="truncate text-sm font-medium text-text">{value || '—'}</p>
      </div>
    </div>
  )
}

export function Profile({ compact = false }: { compact?: boolean }) {
  const user = useAuthStore((s) => s.user)
  const { accountType, setAccountType } = useAccountSwitch()

  const tabs: { key: AccountType; label: string; icon: React.ReactNode }[] = [
    { key: 'personal', label: '个人账户', icon: <UserRound size={16} /> },
    { key: 'enterprise', label: '企业账户', icon: <Building2 size={16} /> },
  ]

  return (
    <div className={cn('space-y-5', compact && 'space-y-4')}>
      {/* 账户类型切换（纯前端占位） */}
      <section className={cn('panel-card p-5', compact && 'p-4')}>
        <header className="mb-4 flex items-center gap-2">
          <UserIcon size={16} className="text-blue" />
          <h2 className="text-sm font-semibold text-text">账户类型</h2>
        </header>
        <div className="inline-flex rounded-pill bg-panel/60 p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setAccountType(t.key)}
              className={cn(
                'flex items-center gap-1.5 rounded-pill px-4 py-1.5 text-sm transition-all',
                accountType === t.key
                  ? 'bg-blue text-[#07121d]'
                  : 'text-muted hover:text-text',
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          当前为
          <span className={cn('mx-1 font-medium', accountType === 'enterprise' ? 'text-blue' : 'text-amber')}>
            {accountType === 'enterprise' ? '企业账户' : '个人账户'}
          </span>
          视图（演示占位，切换不会调用后端接口）。
        </p>
      </section>

      {/* 个人资料 */}
      <section className={cn('panel-card p-5', compact && 'p-4')}>
        <header className="mb-4 flex items-center gap-2">
          <IdCard size={16} className="text-blue" />
          <h2 className="text-sm font-semibold text-text">个人资料</h2>
        </header>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field icon={<UserRound size={16} />} label="昵称" value={user?.nickname} />
          <Field icon={<IdCard size={16} />} label="用户 ID" value={user?.id} />
          <Field icon={<Mail size={16} />} label="邮箱" value={user?.email} />
          <Field icon={<Phone size={16} />} label="手机号" value={user?.phone} />
          <Field
            icon={<UserIcon size={16} />}
            label="角色"
            value={user?.role === 'admin' ? '管理员' : '普通用户'}
          />
          <Field
            icon={<IdCard size={16} />}
            label="注册时间"
            value={user?.createdAt ? new Date(user.createdAt).toLocaleString('zh-CN', { hour12: false }) : undefined}
          />
        </div>
      </section>
    </div>
  )
}
