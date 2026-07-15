import { User as UserIcon, Building2, UserRound, Mail, Phone, IdCard } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useAuthStore } from '@/stores'

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

  return (
    <div className={cn('space-y-5', compact && 'space-y-4')}>
      {/* 当前后端仅支持个人账户，企业入口明确标记为未开放。 */}
      <section className={cn('panel-card p-5', compact && 'p-4')}>
        <header className="mb-4 flex items-center gap-2">
          <UserIcon size={16} className="text-blue" />
          <h2 className="text-sm font-semibold text-text">账户类型</h2>
        </header>
        <div className="inline-flex rounded-pill bg-panel/60 p-1">
          <span className="flex items-center gap-1.5 rounded-pill bg-blue px-4 py-1.5 text-sm text-[#07121d]">
            <UserRound size={16} /> 个人账户
          </span>
          <span className="flex cursor-not-allowed items-center gap-1.5 rounded-pill px-4 py-1.5 text-sm text-muted opacity-60">
            <Building2 size={16} /> 企业账户（暂未开放）
          </span>
        </div>
        <p className="mt-3 text-xs text-muted">当前账户类型由服务端账号资料决定。</p>
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
