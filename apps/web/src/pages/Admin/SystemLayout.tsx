import { useState } from 'react'
import { Plus, X, Save, Check, Megaphone, Star, Tags } from 'lucide-react'
import { PageHeader } from './Overview'
import { cn } from '@/utils/cn'

// 演示数据
const MOCK_INDUSTRIES = ['餐饮', '零售', '教育', '医疗', '地产', '美业']
const MOCK_RECOMMENDED = ['门头招牌经典款', '企业文化墙简约', '餐饮促销海报', '节日横版海报']

export function SystemLayoutPanel() {
  const [industries, setIndustries] = useState<string[]>(MOCK_INDUSTRIES)
  const [newIndustry, setNewIndustry] = useState('')
  const [recommended, setRecommended] = useState<string[]>(MOCK_RECOMMENDED)
  const [announcement, setAnnouncement] = useState('')
  const [saved, setSaved] = useState(false)

  const addIndustry = () => {
    const v = newIndustry.trim()
    if (v && !industries.includes(v)) setIndustries([...industries, v])
    setNewIndustry('')
  }
  const removeIndustry = (v: string) => setIndustries(industries.filter((i) => i !== v))

  const onSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <PageHeader title="系统布局" desc="配置首页推荐、行业分类与公告" />
        <button className={cn('btn-primary', saved && '!from-green !to-green')} onClick={onSave}>
          {saved ? <Check size={15} /> : <Save size={15} />}
          {saved ? '已保存' : '保存配置'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* 行业分类管理 */}
        <section className="panel-card p-4">
          <header className="mb-3 flex items-center gap-2">
            <Tags size={15} className="text-blue" />
            <h2 className="text-sm font-semibold text-text">行业分类管理</h2>
          </header>
          <div className="flex flex-wrap gap-2">
            {industries.map((i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-pill border border-border bg-white/5 px-3 py-1.5 text-sm text-text">
                {i}
                <button onClick={() => removeIndustry(i)} className="text-muted hover:text-red">
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={newIndustry}
              onChange={(e) => setNewIndustry(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addIndustry()}
              placeholder="新增行业分类"
              className="h-9 flex-1 rounded-btn border border-border bg-panel px-3 text-sm text-text outline-none focus:border-blue/60"
            />
            <button className="btn-secondary" onClick={addIndustry}>
              <Plus size={15} /> 添加
            </button>
          </div>
        </section>

        {/* 首页推荐模板 */}
        <section className="panel-card p-4">
          <header className="mb-3 flex items-center gap-2">
            <Star size={15} className="text-blue" />
            <h2 className="text-sm font-semibold text-text">首页推荐模板</h2>
          </header>
          <div className="space-y-2">
            {recommended.map((r, idx) => (
              <div
                key={r}
                className="flex items-center justify-between rounded-btn border border-border bg-panel-2/40 px-3 py-2 text-sm"
              >
                <span className="text-text">
                  <span className="mr-2 text-xs text-muted">#{idx + 1}</span>
                  {r}
                </span>
                <button
                  onClick={() => setRecommended(recommended.filter((x) => x !== r))}
                  className="text-muted hover:text-red"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* 公告设置（预留） */}
      <section className="panel-card p-4">
        <header className="mb-3 flex items-center gap-2">
          <Megaphone size={15} className="text-blue" />
          <h2 className="text-sm font-semibold text-text">公告设置（预留）</h2>
        </header>
        <textarea
          value={announcement}
          onChange={(e) => setAnnouncement(e.target.value)}
          rows={3}
          placeholder="配置全站公告内容（功能预留）"
          className="w-full rounded-btn border border-border bg-panel px-3 py-2 text-sm text-text outline-none focus:border-blue/60"
        />
      </section>
    </div>
  )
}
