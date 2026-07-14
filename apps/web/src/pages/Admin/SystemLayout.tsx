import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Template } from '@/types'
import { Plus, X, Save, Check, Megaphone, Star, Tags, Loader2, AlertTriangle } from 'lucide-react'
import { PageHeader } from './Overview'
import { cn } from '@/utils/cn'
import { adminConfigApi, type SiteSettings } from '@/services/admin-config.api'

const FALLBACK: SiteSettings = {
  siteName: '',
  allowGuestBrowse: false,
  maintenanceMode: false,
  maxUploadMb: 20,
  industries: [],
  recommendedTemplates: [],
  announcement: '',
}

export function SystemLayoutPanel() {
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-config', 'settings'],
    queryFn: adminConfigApi.getSettings,
  })
  // 真实模板库（用于「首页推荐模板」选择）
  const { data: tplData, isLoading: tplLoading } = useQuery({
    queryKey: ['admin-config', 'templates-pool'],
    queryFn: () => adminConfigApi.listAdminTemplates({ pageSize: 100 }),
  })
  const templates: Template[] = tplData?.items ?? []
  const tplMap = Object.fromEntries(templates.map((t) => [t.id, t.title]))

  const [draft, setDraft] = useState<SiteSettings>(FALLBACK)
  const [newIndustry, setNewIndustry] = useState('')
  const [pickTpl, setPickTpl] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (data) setDraft(data)
  }, [data])

  const addIndustry = () => {
    const v = newIndustry.trim()
    if (v && !draft.industries.includes(v))
      setDraft((d) => ({ ...d, industries: [...d.industries, v] }))
    setNewIndustry('')
  }
  const removeIndustry = (v: string) =>
    setDraft((d) => ({ ...d, industries: d.industries.filter((i) => i !== v) }))

  const addRec = () => {
    if (pickTpl && !draft.recommendedTemplates.includes(pickTpl))
      setDraft((d) => ({ ...d, recommendedTemplates: [...d.recommendedTemplates, pickTpl] }))
    setPickTpl('')
  }
  const removeRec = (id: string) =>
    setDraft((d) => ({ ...d, recommendedTemplates: d.recommendedTemplates.filter((x) => x !== id) }))

  const dirty = JSON.stringify(draft) !== JSON.stringify(data ?? FALLBACK)
  const mut = useMutation({
    mutationFn: () => adminConfigApi.updateSettings(draft),
    onSuccess: (savedData) => {
      qc.setQueryData(['admin-config', 'settings'], savedData)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-5">
        <PageHeader title="系统布局" desc="配置首页推荐、行业分类与公告" />
        <div className="flex items-center gap-2 py-10 text-muted">
          <Loader2 size={16} className="animate-spin" /> 加载中…
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <PageHeader title="系统布局" desc="配置首页推荐、行业分类与公告（实时写入服务端）" />
        <button
          className={cn('btn-primary', saved && '!from-green !to-green', (!dirty || mut.isPending) && 'opacity-50')}
          disabled={!dirty || mut.isPending}
          onClick={() => mut.mutate()}
        >
          {mut.isPending ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : <Save size={15} />}
          {saved ? '已保存' : '保存配置'}
        </button>
      </div>

      {isError && (
        <div className="flex items-center gap-2 rounded-btn border border-red/30 bg-red/8 px-4 py-3 text-sm text-red">
          <AlertTriangle size={15} /> 设置加载失败，请稍后重试。
        </div>
      )}
      {mut.isError && (
        <div className="flex items-center gap-2 rounded-btn border border-red/30 bg-red/8 px-4 py-3 text-sm text-red">
          <AlertTriangle size={15} /> {mut.error instanceof Error ? mut.error.message : '保存失败'}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* 行业分类管理 */}
        <section className="panel-card p-4">
          <header className="mb-3 flex items-center gap-2">
            <Tags size={15} className="text-blue" />
            <h2 className="text-sm font-semibold text-text">行业分类管理</h2>
          </header>
          <div className="flex flex-wrap gap-2">
            {draft.industries.map((i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-pill border border-border bg-white/5 px-3 py-1.5 text-sm text-text">
                {i}
                <button onClick={() => removeIndustry(i)} className="text-muted hover:text-red">
                  <X size={13} />
                </button>
              </span>
            ))}
            {draft.industries.length === 0 && <span className="text-xs text-muted">暂无行业分类</span>}
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
            {draft.recommendedTemplates
              .filter((id) => tplMap[id])
              .map((id) => (
                <div
                  key={id}
                  className="flex items-center justify-between rounded-btn border border-border bg-panel-2/40 px-3 py-2 text-sm"
                >
                  <span className="truncate text-text">{tplMap[id]}</span>
                  <button onClick={() => removeRec(id)} className="text-muted hover:text-red">
                    <X size={14} />
                  </button>
                </div>
              ))}
            {draft.recommendedTemplates.filter((id) => tplMap[id]).length === 0 && (
              <span className="text-xs text-muted">暂无推荐模板</span>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <select
              value={pickTpl}
              onChange={(e) => setPickTpl(e.target.value)}
              disabled={tplLoading}
              className="h-9 flex-1 rounded-btn border border-border bg-panel px-3 text-sm text-text outline-none focus:border-blue/60"
            >
              <option value="">{tplLoading ? '加载模板库…' : '从真实模板库选择…'}</option>
              {templates
                .filter((t) => !draft.recommendedTemplates.includes(t.id))
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
            </select>
            <button className="btn-secondary" onClick={addRec} disabled={!pickTpl}>
              <Plus size={15} /> 添加
            </button>
          </div>
        </section>
      </div>

      {/* 公告设置 */}
      <section className="panel-card p-4">
        <header className="mb-3 flex items-center gap-2">
          <Megaphone size={15} className="text-blue" />
          <h2 className="text-sm font-semibold text-text">全站公告</h2>
        </header>
        <textarea
          value={draft.announcement}
          onChange={(e) => setDraft((d) => ({ ...d, announcement: e.target.value }))}
          rows={3}
          placeholder="配置全站公告内容"
          className="w-full rounded-btn border border-border bg-panel px-3 py-2 text-sm text-text outline-none focus:border-blue/60"
        />
      </section>
    </div>
  )
}
