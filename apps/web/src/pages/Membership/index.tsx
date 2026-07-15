import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Crown,
  Coins,
  Sparkles,
  Check,
  Loader2,
  Gift,
  Zap,
  ShieldCheck,
  Info,
} from 'lucide-react'
import { toast } from 'sonner'
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
        到账 <span className="font-bold">{formatPoints(plan.points)}</span> 积分
      </div>

      <button
        disabled
        className="btn-primary mt-1 flex items-center justify-center gap-2 opacity-60"
      >
        <Check size={15} />
        {plan.isActive ? '支付接口待接入' : '暂不可售'}
      </button>
      <p className="text-center text-[11px] text-muted">
        {plan.isActive ? '请联系管理员开通，不会自动到账' : '该套餐已下架'}
      </p>
    </div>
  )
}

export function MembershipModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<TabKey>('plans')
  const [rechargeAmount, setRechargeAmount] = useState<number>(2900)
  const [rechargeNote, setRechargeNote] = useState('')
  const qc = useQueryClient()

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

  /** 预留：调用 POST /api/credits/recharge，403/错误原样展示，绝不伪造成功到账 */
  const rechargeMut = useMutation({
    mutationFn: (amount: number) => membershipApi.recharge(amount),
    onSuccess: () => {
      // 仅当后端真正返回成功时刷新（当前环境应为 403）
      toast.success('充值请求已受理')
      void qc.invalidateQueries({ queryKey: ['membership'] })
    },
    onError: (e: Error) => {
      const msg = e.message || '充值失败'
      setRechargeNote(msg)
      toast.error(msg.includes('尚未') || msg.includes('403') ? msg : `充值不可用：${msg}`)
    },
  })

  const active = (mineQ.data ?? []).filter((m) => m.status === 'active' || new Date(m.expiresAt) > new Date())
  const current = active[0]

  const allPlans = plansQ.data ?? []
  // 优先按名称呈现月度/年度/企业；其余套餐仍展示
  const sortMember = (list: MembershipPlan[]) => {
    const rank = (p: MembershipPlan) => {
      const n = (p.code + p.name).toLowerCase()
      if (/month|月/.test(n)) return 1
      if (/year|年|annual/.test(n)) return 2
      if (/enterprise|企业|team|团/.test(n)) return 3
      return 9
    }
    return list.slice().sort((a, b) => rank(a) - rank(b) || a.sortOrder - b.sortOrder)
  }
  const creditPlans = allPlans.filter((p) => /credit|point|积分包|充值/.test(p.code + p.name))
  const memberPlans = sortMember(allPlans.filter((p) => !/credit|point|积分包|充值/.test(p.code + p.name)))

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

            <section className="panel-card space-y-3 p-4">
              <header className="flex items-center gap-2">
                <Coins size={16} className="text-amber" />
                <h2 className="text-sm font-semibold text-text">自选金额充值</h2>
              </header>
              <div className="rounded-card border border-amber/30 bg-amber/10 px-3 py-2 text-xs text-amber">
                支付接口待接入：当前无法在线支付，点击不会到账。请联系管理员为你调整积分。
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { amt: 2900, pts: 29 },
                  { amt: 9900, pts: 99 },
                  { amt: 29900, pts: 299 },
                ].map(({ amt, pts }) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setRechargeAmount(amt)}
                    className={cn(
                      'rounded-card border px-2 py-3 text-center transition-all',
                      rechargeAmount === amt
                        ? 'border-amber bg-amber/15 text-text'
                        : 'border-border bg-panel/60 text-muted hover:text-text',
                    )}
                  >
                    <p className="text-sm font-semibold">{formatYuan(amt)}</p>
                    <p className="mt-1 text-[11px]">约 {pts * 10} 积分</p>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-muted">
                  自定义金额（分）
                  <input
                    type="number"
                    min={100}
                    step={100}
                    value={rechargeAmount}
                    onChange={(e) => setRechargeAmount(Math.max(0, Number(e.target.value)))}
                    className="mt-1 h-9 w-36 rounded-btn border border-border bg-panel px-3 text-sm text-text outline-none focus:border-blue/60"
                  />
                </label>
                <div className="text-xs text-muted">
                  展示金额 <span className="font-semibold text-text">{formatYuan(rechargeAmount)}</span>
                  <span className="mx-1">·</span>
                  参考到账约{' '}
                  <span className="font-semibold text-amber">{Math.floor(rechargeAmount / 10)} 积分</span>
                </div>
              </div>
              <button
                type="button"
                disabled={rechargeMut.isPending || rechargeAmount < 100}
                className="btn-primary flex w-full items-center justify-center gap-2"
                onClick={() => {
                  setRechargeNote('')
                  rechargeMut.mutate(rechargeAmount)
                }}
              >
                {rechargeMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Coins size={15} />}
                提交充值意向（支付宝待接入）
              </button>
              {rechargeNote ? (
                <div className="flex items-start gap-2 rounded-card border border-amber/40 bg-amber/10 px-3 py-2 text-xs text-amber">
                  <Info size={14} className="mt-0.5 shrink-0" />
                  <p>
                    <span className="font-semibold">状态：待支付 / 未到账。</span> {rechargeNote}
                    请联系管理员处理，页面不会显示虚假到账。
                  </p>
                </div>
              ) : (
                <p className="text-center text-[11px] text-muted">
                  支付宝密钥与回调未配置时，接口会返回明确错误；积分不会自动增加。
                </p>
              )}
            </section>
          </div>
        )}
      </div>
    </Dialog>
  )
}
