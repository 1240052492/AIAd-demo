import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Crown,
  Coins,
  Sparkles,
  Check,
  Loader2,
  Receipt,
  Gift,
  UserRound,
  Zap,
  ShieldCheck,
} from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { cn } from '@/utils/cn'
import { membershipApi, type MembershipPlan } from '@/services/membership.api'
import { useCreditStore } from '@/stores'
import { formatYuan, formatPoints, PointsDetail } from './PointsDetail'
import { Profile } from './Profile'

type TabKey = 'center' | 'mall' | 'detail' | 'profile'

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'center', label: '会员中心', icon: <Crown size={16} /> },
  { key: 'mall', label: '积分超市', icon: <Gift size={16} /> },
  { key: 'detail', label: '积分明细', icon: <Receipt size={16} /> },
  { key: 'profile', label: '个人中心', icon: <UserRound size={16} /> },
]

function PlanCard({
  plan,
  onPurchase,
  purchasing,
}: {
  plan: MembershipPlan
  onPurchase: (plan: MembershipPlan) => void
  purchasing: boolean
}) {
  const isCredits = /credit|point|积分/i.test(plan.code + plan.name)
  return (
    <div className="panel-card flex flex-col gap-3 p-5 transition-all hover:border-blue/40">
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
        disabled={purchasing}
        onClick={() => onPurchase(plan)}
        className="btn-primary mt-1 flex items-center justify-center gap-2"
      >
        {purchasing ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
        {plan.isActive ? '开通 / 购买' : '暂不可售'}
      </button>
    </div>
  )
}

export default function MembershipPage() {
  const [tab, setTab] = useState<TabKey>('center')
  const [rechargeAmount, setRechargeAmount] = useState<number>(2900)
  const queryClient = useQueryClient()
  const setBalance = useCreditStore((s) => s.setBalance)

  const plansQ = useQuery({
    queryKey: ['membership', 'plans'],
    queryFn: async () => (await membershipApi.getPlans()).data,
  })

  const mineQ = useQuery({
    queryKey: ['membership', 'mine'],
    queryFn: async () => (await membershipApi.getMine()).data,
  })

  const refreshBalance = async () => {
    try {
      const r = await membershipApi.getBalance()
      setBalance(r.data.balance, r.data.frozenBalance)
    } catch {
      /* ignore */
    }
  }

  const purchaseMut = useMutation({
    mutationFn: (plan: MembershipPlan) => membershipApi.purchasePlan(plan.code),
    onSuccess: async () => {
      toast.success('开通成功，积分已到账')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['membership', 'mine'] }),
        queryClient.invalidateQueries({ queryKey: ['membership', 'plans'] }),
        refreshBalance(),
      ])
    },
    onError: (e: Error) => toast.error(e.message || '开通失败'),
  })

  const rechargeMut = useMutation({
    mutationFn: (amount: number) => membershipApi.recharge(amount),
    onSuccess: async () => {
      toast.success('充值成功，积分已到账（演示）')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['membership', 'balance'] }),
        queryClient.invalidateQueries({ queryKey: ['membership', 'transactions'] }),
        refreshBalance(),
      ])
    },
    onError: (e: Error) => toast.error(e.message || '充值失败'),
  })

  const active = (mineQ.data ?? []).filter((m) => m.status === 'active' || new Date(m.expiresAt) > new Date())
  const current = active[0]

  const allPlans = plansQ.data ?? []
  const creditPlans = allPlans.filter((p) => /credit|point|积分/i.test(p.code + p.name))
  const memberPlans = allPlans.filter((p) => !/credit|point|积分/i.test(p.code + p.name))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-text">会员与积分</h1>
        <p className="mt-1 text-sm text-muted">管理你的会员权益、积分余额与消费明细</p>
      </div>

      {/* 顶部状态条 */}
      <section
        className={cn(
          'panel-card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between',
          current ? 'border-blue/40' : 'border-amber/40',
        )}
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-card',
              current
                ? 'bg-gradient-to-br from-blue to-[#7cc7ff] text-[#07121d]'
                : 'bg-amber/15 text-amber',
            )}
          >
            {current ? <Crown size={20} /> : <Zap size={20} />}
          </div>
          <div>
            {current ? (
              <>
                <p className="text-sm font-semibold text-text">
                  当前会员：{current.plan.name}
                </p>
                <p className="text-xs text-muted">
                  有效期至 {new Date(current.expiresAt).toLocaleDateString('zh-CN')} · 已赠{' '}
                  {formatPoints(current.pointsGranted)} 积分
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-text">未开通会员</p>
                <p className="text-xs text-muted">开通会员即可享受倍率权益与积分赠送</p>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted">
          <ShieldCheck size={15} />
          {current ? '会员权益生效中' : '点击「开通 / 购买」立即升级'}
        </div>
      </section>

      {/* Tab 切换 */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-colors',
              tab === t.key
                ? 'border-blue text-text'
                : 'border-transparent text-muted hover:text-text',
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* 会员中心 */}
      {tab === 'center' && (
        <div className="space-y-4">
          {plansQ.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted" />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(memberPlans.length ? memberPlans : allPlans).map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  purchasing={purchaseMut.isPending && purchaseMut.variables?.code === plan.code}
                  onPurchase={(p) => purchaseMut.mutate(p)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 积分超市 */}
      {tab === 'mall' && (
        <div className="space-y-4">
          {creditPlans.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {creditPlans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  purchasing={purchaseMut.isPending && purchaseMut.variables?.code === plan.code}
                  onPurchase={(p) => purchaseMut.mutate(p)}
                />
              ))}
            </div>
          )}

          {/* 演示充值（立即到账，无需真实支付） */}
          <section className="panel-card p-5">
            <header className="mb-3 flex items-center gap-2">
              <Coins size={16} className="text-amber" />
              <h2 className="text-sm font-semibold text-text">积分充值（演示）</h2>
            </header>
            <div className="flex flex-wrap items-center gap-3">
              {[2900, 9900, 29900].map((amt) => (
                <button
                  key={amt}
                  onClick={() => setRechargeAmount(amt)}
                  className={cn(
                    'rounded-pill px-4 py-1.5 text-sm transition-all',
                    rechargeAmount === amt
                      ? 'bg-amber text-[#221400]'
                      : 'bg-panel/60 text-muted hover:text-text',
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
                disabled={rechargeMut.isPending || rechargeAmount < 100}
                onClick={() => rechargeMut.mutate(rechargeAmount)}
                className="btn-primary flex items-center gap-2"
              >
                {rechargeMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Coins size={15} />}
                充值 {formatYuan(rechargeAmount)}
              </button>
            </div>
            <p className="mt-2 text-xs text-muted">演示环境：充值后立即到账等额积分，不经过真实支付。</p>
          </section>
        </div>
      )}

      {/* 积分明细 */}
      {tab === 'detail' && <PointsDetail />}

      {/* 个人中心 */}
      {tab === 'profile' && <Profile />}

      <Toaster position="top-center" richColors />
    </div>
  )
}
