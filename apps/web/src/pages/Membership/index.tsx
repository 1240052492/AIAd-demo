import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Crown,
  Coins,
  Sparkles,
  Check,
  Loader2,
  Gift,
  Zap,
  ShieldCheck,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { membershipApi, type MembershipPlan } from '@/services/membership.api'
import { formatYuan, formatPoints } from './PointsDetail'
import { Dialog } from '@/components/ui/Dialog'

type TabKey = 'plans' | 'recharge'

function PlanCard({
  plan,
}: {
  plan: MembershipPlan
}) {
  const isCredits = /credit|point|积分/i.test(plan.code + plan.name)
  return (
    <div className="panel-card flex flex-col gap-3 p-4 transition-all hover:border-blue/40">
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-card bg-gradient-to-br from-blue to-[#7cc7ff] text-[#07121d]">
          {isCredits ? <Coins size={18} /> : <Crown size={18} />}
        </div>
        {plan.durationDays > 0 && (
          <span className="rounded-pill bg-white/5 px-2.5 py-0.5 text-xs text-muted">
            有效期 {plan.durationDays} 天
          </span>
        )}
      </div>

      <div>
        <h3 className="text-base font-semibold text-text">{plan.name}</h3>
        {plan.description && <p className="mt-1 line-clamp-2 text-xs text-muted">{plan.description}</p>}
      </div>

      <div className="flex items-end gap-1">
        <span className="text-2xl font-bold text-text">{formatYuan(plan.price)}</span>
        {plan.rate > 0 && plan.rate !== 1 && (
          <span className="mb-1 text-xs text-muted">× {plan.rate} 倍权益</span>
        )}
      </div>

      <div className="flex items-center gap-1.5 rounded-card bg-amber/10 px-3 py-2 text-sm text-amber">
        <Sparkles size={14} />
        开通即赠 <span className="font-bold">{formatPoints(plan.points)}</span> 积分
      </div>

      <button
        disabled
        className="btn-primary mt-1 flex items-center justify-center gap-2 opacity-60"
      >
        <Check size={15} />
        {plan.isActive ? '联系管理员开通' : '暂不可售'}
      </button>
    </div>
  )
}

export function MembershipModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<TabKey>('plans')
  const [rechargeAmount, setRechargeAmount] = useState<number>(2900)

  const plansQ = useQuery({
    queryKey: ['membership', 'plans'],
    queryFn: async () => (await membershipApi.getPlans()).data,
    enabled: open,
  })

  const mineQ = useQuery({
    queryKey: ['membership', 'mine'],
    queryFn: async () => (await membershipApi.getMine()).data,
    enabled: open,
  })

  const active = (mineQ.data ?? []).filter((m) => m.status === 'active' || new Date(m.expiresAt) > new Date())
  const current = active[0]

  const allPlans = plansQ.data ?? []
  const creditPlans = allPlans.filter((p) => /credit|point|积分/i.test(p.code + p.name))
  const memberPlans = allPlans.filter((p) => !/credit|point|积分/i.test(p.code + p.name))

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="会员中心"
      description="管理会员权益与积分余额"
      className="max-w-2xl"
    >
      <div className="space-y-4">
        {/* 状态条 */}
        <section
          className={cn(
            'panel-card flex items-center justify-between gap-3 p-4',
            current ? 'border-blue/40' : 'border-amber/40',
          )}
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-card',
                current ? 'bg-gradient-to-br from-blue to-[#7cc7ff] text-[#07121d]' : 'bg-amber/15 text-amber',
              )}
            >
              {current ? <Crown size={18} /> : <Zap size={18} />}
            </div>
            <div>
              {current ? (
                <>
                  <p className="text-sm font-semibold text-text">当前会员：{current.plan.name}</p>
                  <p className="text-xs text-muted">
                    有效期至 {new Date(current.expiresAt).toLocaleDateString('zh-CN')} · 已赠{' '}
                    {formatPoints(current.pointsGranted)} 积分
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-text">未开通会员</p>
                  <p className="text-xs text-muted">本期暂不开放在线支付，请联系管理员开通</p>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted">
            <ShieldCheck size={15} />
            {current ? '权益生效中' : '支付待开通'}
          </div>
        </section>

        {/* 内部 tab */}
        <div className="flex gap-1 border-b border-border">
          <button
            onClick={() => setTab('plans')}
            className={cn(
              'flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors',
              tab === 'plans' ? 'border-blue text-text' : 'border-transparent text-muted hover:text-text',
            )}
          >
            <Crown size={15} />
            会员套餐
          </button>
          <button
            onClick={() => setTab('recharge')}
            className={cn(
              'flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors',
              tab === 'recharge' ? 'border-blue text-text' : 'border-transparent text-muted hover:text-text',
            )}
          >
            <Gift size={15} />
            积分充值
          </button>
        </div>

        {/* 会员套餐 */}
        {tab === 'plans' && (
          <div className="space-y-3">
            {plansQ.isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted" />
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {(memberPlans.length ? memberPlans : allPlans).map((plan) => (
                  <PlanCard key={plan.id} plan={plan} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* 积分充值 */}
        {tab === 'recharge' && (
          <div className="space-y-3">
            {creditPlans.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {creditPlans.map((plan) => (
                  <PlanCard key={plan.id} plan={plan} />
                ))}
              </div>
            )}

            <section className="panel-card p-4">
              <header className="mb-3 flex items-center gap-2">
                <Coins size={16} className="text-amber" />
                <h2 className="text-sm font-semibold text-text">积分充值</h2>
              </header>
              <div className="flex flex-wrap items-center gap-3">
                {[2900, 9900, 29900].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setRechargeAmount(amt)}
                    className={cn(
                      'rounded-pill px-4 py-1.5 text-sm transition-all',
                      rechargeAmount === amt ? 'bg-amber text-[#221400]' : 'bg-panel/60 text-muted hover:text-text',
                    )}
                  >
                    {formatYuan(amt)}
                  </button>
                ))}
                <input
                  type="number"
                  min={100}
                  step={100}
                  value={rechargeAmount}
                  onChange={(e) => setRechargeAmount(Math.max(0, Number(e.target.value)))}
                  className="h-9 w-32 rounded-btn border border-border bg-panel px-3 text-sm text-text outline-none focus:border-blue/60"
                />
                <button
                  disabled
                  onClick={() => undefined}
                  className="btn-primary flex items-center gap-2 opacity-60"
                >
                  <Coins size={15} />
                  联系管理员充值
                </button>
              </div>
              <p className="mt-2 text-xs text-muted">在线支付尚未开通，本期由后台管理员手动调整积分。</p>
            </section>
          </div>
        )}
      </div>
    </Dialog>
  )
}
