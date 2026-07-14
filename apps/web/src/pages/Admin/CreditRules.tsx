import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, Loader2, Check, AlertTriangle } from 'lucide-react'
import { PageHeader } from './Overview'
import { cn } from '@/utils/cn'
import { adminConfigApi, type CreditRules as CreditRulesType } from '@/services/admin-config.api'

const RULE_META: { key: keyof CreditRulesType; action: string; desc: string }[] = [
  { key: 'registerBonus', action: '注册赠送', desc: '新用户注册赠送积分' },
  { key: 'imageGeneration', action: '视觉生图', desc: '每次 GPT-image-2 生图（单张）' },
  { key: 'composition', action: '环境合成', desc: '套入门头 / 墙体照片合成' },
  { key: 'exportPng', action: '导出 PNG', desc: '导出 PNG 文件' },
  { key: 'exportPdf', action: '导出 PDF', desc: '导出 PDF 文件' },
  { key: 'exportSvg', action: '导出 SVG', desc: '导出 SVG 文件' },
]

const DEFAULTS: CreditRulesType = {
  registerBonus: 5,
  imageGeneration: 2,
  composition: 1,
  exportPng: 1,
  exportPdf: 2,
  exportSvg: 1,
}

export function CreditRules() {
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-config', 'credit-rules'],
    queryFn: adminConfigApi.getCreditRules,
  })
  const [draft, setDraft] = useState<CreditRulesType>(DEFAULTS)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (data) setDraft(data)
  }, [data])

  const update = (key: keyof CreditRulesType, cost: number) =>
    setDraft((d) => ({ ...d, [key]: cost }))

  const dirty = JSON.stringify(draft) !== JSON.stringify(data ?? DEFAULTS)

  const mutation = useMutation({
    mutationFn: () => adminConfigApi.updateCreditRules(draft),
    onSuccess: (savedData) => {
      qc.setQueryData(['admin-config', 'credit-rules'], savedData)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-5">
        <PageHeader title="积分规则" desc="配置各项操作的积分消耗 / 赠送" />
        <div className="flex items-center gap-2 py-10 text-muted">
          <Loader2 size={16} className="animate-spin" /> 加载中…
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader title="积分规则" desc="配置各项操作的积分消耗 / 赠送（实时写入服务端）" />

      {isError && (
        <div className="flex items-center gap-2 rounded-btn border border-red/30 bg-red/8 px-4 py-3 text-sm text-red">
          <AlertTriangle size={15} /> 规则加载失败，请稍后重试。
        </div>
      )}

      <section className="panel-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-panel-2/80 text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">操作</th>
                <th className="px-4 py-3 font-medium">说明</th>
                <th className="px-4 py-3 font-medium">积分消耗 / 赠送</th>
              </tr>
            </thead>
            <tbody>
              {RULE_META.map((r) => (
                <tr key={r.key} className="border-t border-border">
                  <td className="px-4 py-3 font-medium text-text">{r.action}</td>
                  <td className="px-4 py-3 text-muted">{r.desc}</td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min={0}
                      value={draft[r.key]}
                      onChange={(e) => update(r.key, Number(e.target.value))}
                      className="h-9 w-28 rounded-btn border border-border bg-panel px-3 text-sm text-text outline-none focus:border-blue/60"
                    />
                    <span className="ml-2 text-xs text-muted">积分</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          className={cn('btn-primary', saved && '!from-green !to-green', (!dirty || mutation.isPending) && 'opacity-50')}
          disabled={!dirty || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? (
            <Loader2 size={15} className="animate-spin" />
          ) : saved ? (
            <Check size={15} />
          ) : (
            <Save size={15} />
          )}
          {saved ? '已保存' : '保存配置'}
        </button>
        {mutation.isError && (
          <span className="text-sm text-red">
            {mutation.error instanceof Error ? mutation.error.message : '保存失败'}
          </span>
        )}
      </div>
    </div>
  )
}
