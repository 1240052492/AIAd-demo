import { RolePermissions } from '@/services/admin-config.api'
import { cn } from '@/utils/cn'

export const PERMISSION_LABELS: { key: keyof RolePermissions; label: string; desc: string }[] = [
  { key: 'canGenerate', label: 'AI 生图', desc: '允许调用 AI 生图 / 合成' },
  { key: 'canCompose', label: '环境合成', desc: '允许套图合成' },
  { key: 'canAccessAdmin', label: '后台访问', desc: '可进入管理控制台' },
  { key: 'canRecharge', label: '充值积分', desc: '可购买积分' },
  { key: 'canManageUsers', label: '用户管理', desc: '可管理其他用户' },
  { key: 'canExport', label: '导出作品', desc: '允许导出 PNG/SVG/PDF' },
  { key: 'canPriority', label: '优先队列', desc: '任务优先调度' },
  { key: 'canTeam', label: '团队协作', desc: '可创建 / 加入团队' },
]

/** 暗色主题权限复选列表（受控） */
export function PermissionChecklist({
  value,
  onChange,
  disabled,
}: {
  value: RolePermissions
  onChange: (next: RolePermissions) => void
  disabled?: boolean
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {PERMISSION_LABELS.map((p) => {
        const checked = !!value[p.key]
        return (
          <label
            key={p.key}
            className={cn(
              'flex cursor-pointer items-start gap-2.5 rounded-btn border px-3 py-2 transition-colors',
              checked ? 'border-blue/45 bg-blue/10' : 'border-border bg-panel hover:border-white/20',
              disabled && 'pointer-events-none opacity-60',
            )}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => onChange({ ...value, [p.key]: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-blue"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-text">{p.label}</span>
              <span className="block text-xs text-muted">{p.desc}</span>
            </span>
          </label>
        )
      })}
    </div>
  )
}

export const EMPTY_PERMISSIONS: RolePermissions = {
  canGenerate: false,
  canCompose: false,
  canAccessAdmin: false,
  canRecharge: false,
  canManageUsers: false,
  canExport: false,
  canPriority: false,
  canTeam: false,
}
