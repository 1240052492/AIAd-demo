import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Save, Loader2, Check } from 'lucide-react'
import { PageHeader } from './Overview'
import { cn } from '@/utils/cn'

interface CreditRule {
  key: string
  action: string
  desc: string
  cost: number
}

// 演示数据（后端暂无 /admin/credit-rules 接口）
const MOCK_RULES: CreditRule[] = [
  { key: 'image_generation', action: '视觉生图', desc: '每次 GPT-image-2 生图（单张）', cost: 12 },
  { key: 'composition', action: '环境合成', desc: '套入门头 / 墙体照片合成', cost: 8 },
  { key: 'export', action: '导出输出', desc: '导出 PNG / SVG / PDF', cost: 5 },
  { key: 'prompt', action: '提示词生成', desc: 'AI 生成创意提示词', cost: 2 },
  { key: 'brief', action: '需求整理', desc: 'AE 需求转标准 brief', cost: 2 },
  { key: 'register_bonus', action: '注册赠送', desc: '新用户注册赠送积分', cost: 100 },
]

export function CreditRules() {
  const { data } = useQuery({ queryKey: ['admin', 'credit-rules'], queryFn: async () => MOCK_RULES })
  const [rules, setRules] = useState<CreditRule[]>(data ?? MOCK_RULES)
  const [saved, setSaved] = useState(false)

  const update = (key: string, cost: number) =>
    setRules((rs) => rs.map((r) => (r.key === key ? { ...r, cost } : r)))

  const onSave = () => {
    // 演示：实际应调用 admin 接口保存
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-5">
      <PageHeader title="积分规则" desc="配置各项操作的积分消耗 / 赠送" />

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
              {rules.map((r) => (
                <tr key={r.key} className="border-t border-border">
                  <td className="px-4 py-3 font-medium text-text">{r.action}</td>
                  <td className="px-4 py-3 text-muted">{r.desc}</td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min={0}
                      value={r.cost}
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
        <button className={cn('btn-primary', saved && '!from-green !to-green')} onClick={onSave}>
          {saved ? <Check size={15} /> : <Save size={15} />}
          {saved ? '已保存' : '保存配置'}
        </button>
        {saved && <span className="text-sm text-green">积分规则已更新</span>}
      </div>
    </div>
  )
}
