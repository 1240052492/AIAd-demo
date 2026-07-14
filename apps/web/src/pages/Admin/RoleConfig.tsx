import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Save, Check, Info } from 'lucide-react'
import { PageHeader } from './Overview'
import { PermissionChecklist } from './PermissionsEditor'
import {
  adminConfigApi,
  RoleCode,
  RoleConfig,
  RolePermissions,
} from '@/services/admin-config.api'
import { cn } from '@/utils/cn'

const ROLE_LABELS: Record<RoleCode, string> = {
  admin: '管理员',
  agent: '代理 / 渠道',
  user: '普通用户',
  guest: '访客',
}

export function RoleConfigPanel() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['admin-config', 'role-configs'],
    queryFn: adminConfigApi.getRoleConfigs,
  })

  const [drafts, setDrafts] = useState<Record<string, RoleConfig>>({})
  const [savedCode, setSavedCode] = useState<string | null>(null)

  const configs = data ?? []
  const getDraft = (c: RoleConfig) => drafts[c.roleCode] ?? c

  const mutation = useMutation({
    mutationFn: (c: RoleConfig) =>
      adminConfigApi.updateRoleConfig(c.roleCode, {
        rate: c.rate,
        permissions: c.permissions,
      }),
    onSuccess: (saved) => {
      qc.setQueryData(['admin-config', 'role-configs'], (old: RoleConfig[] = []) =>
        old.map((r) => (r.roleCode === saved.roleCode ? saved : r)),
      )
      setDrafts((d) => {
        const n = { ...d }
        delete n[saved.roleCode]
        return n
      })
      setSavedCode(saved.roleCode)
      setTimeout(() => setSavedCode(null), 2000)
    },
  })

  const setRate = (code: RoleCode, rate: number) =>
    setDrafts((d) => {
      const base = d[code] ?? configs.find((c) => c.roleCode === code)!
      return { ...d, [code]: { ...base, rate } }
    })

  const setPerm = (code: RoleCode, perms: RolePermissions) =>
    setDrafts((d) => {
      const base = d[code] ?? configs.find((c) => c.roleCode === code)!
      return { ...d, [code]: { ...base, permissions: perms } }
    })

  if (isLoading) {
    return (
      <div className="space-y-5">
        <PageHeader title="角色权限配置" desc="配置各角色的充值付款系数与功能权限" />
        <div className="flex items-center gap-2 py-10 text-muted">
          <Loader2 size={16} className="animate-spin" /> 加载中…
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="角色权限配置"
        desc="配置各角色的充值付款系数（rate）与功能权限，保存后即时生效于服务端"
      />

      <div className="flex items-start gap-2 rounded-btn border border-blue/30 bg-blue/8 px-4 py-3 text-sm text-text">
        <Info size={16} className="mt-0.5 shrink-0 text-blue" />
        <p className="text-muted">
          <span className="font-medium text-text">rate（付款系数）</span>
          作用于积分充值付款金额：用户实际付款 = 标准金额 × 角色 rate。例如将
          <span className="font-mono text-text"> agent </span>
          设为
          <span className="font-mono text-text"> 0.7 </span>
          ，则代理商购买同等积分时按 70% 付款。生成 / 合成 / 导出仍按标准积分扣减。设为 1 表示原价。
        </p>
      </div>

      <div className="space-y-4">
        {configs.map((c) => {
          const draft = getDraft(c)
          const dirty =
            draft.rate !== c.rate ||
            JSON.stringify(draft.permissions) !== JSON.stringify(c.permissions)
          return (
            <section key={c.roleCode} className="panel-card overflow-hidden">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-text">
                    {ROLE_LABELS[c.roleCode]}
                    <span className="ml-2 font-mono text-xs text-muted">{c.roleCode}</span>
                  </h2>
                  <p className="mt-0.5 text-xs text-muted">功能权限开关</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted">付款系数 rate</span>
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    max={2}
                    value={draft.rate}
                    onChange={(e) => setRate(c.roleCode, Number(e.target.value))}
                    className="h-9 w-20 rounded-btn border border-border bg-panel px-3 text-sm text-text outline-none focus:border-blue/60"
                  />
                  <button
                    className={cn(
                      'btn-primary !h-9',
                      savedCode === c.roleCode && '!from-green !to-green',
                      (!dirty || mutation.isPending) && 'opacity-50',
                    )}
                    disabled={!dirty || mutation.isPending}
                    onClick={() => mutation.mutate(draft)}
                  >
                    {mutation.isPending ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : savedCode === c.roleCode ? (
                      <Check size={15} />
                    ) : (
                      <Save size={15} />
                    )}
                    {savedCode === c.roleCode ? '已保存' : '保存'}
                  </button>
                </div>
              </header>
              <div className="p-4">
                <PermissionChecklist
                  value={draft.permissions}
                  onChange={(p) => setPerm(c.roleCode, p)}
                />
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
