import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, LayoutGrid, Loader2, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react'
import { templateApi } from '@/services/api'
import { TEMPLATE_CATEGORIES, type Template } from '@/types'
import { cn } from '@/utils/cn'
import { Tag } from '@/components/ui/Tag'
import { Dialog } from '@/components/ui/Dialog'

const PAGE_SIZE = 8

/** 模板库：搜索 + 分类筛选 + 网格 + 分页 + 详情 Dialog */
export function TemplateLibrary() {
  const [keyword, setKeyword] = useState('')
  const [category, setCategory] = useState('全部')
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState<Template | null>(null)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['templates', keyword, category, page],
    queryFn: () =>
      templateApi.list({
        category: category === '全部' ? undefined : category,
        page,
        pageSize: PAGE_SIZE,
        // 备注：后端未提供 keyword 搜索参数，这里仅做本地过滤展示
        businessType: undefined,
      }),
  })

  const list = (data?.data.items ?? []).filter((t) =>
    keyword ? t.title.includes(keyword) || t.prompt.includes(keyword) : true,
  )
  const total = data?.data.total ?? list.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-5">
      {/* 顶部搜索 + 分类筛选 */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value)
                setPage(1)
              }}
              placeholder="搜索模板标题或提示词…"
              className="h-10 w-full rounded-btn border border-border bg-panel pl-9 pr-3 text-sm text-text placeholder:text-muted/70 outline-none focus:border-blue/60"
            />
          </div>
          <span className="hidden items-center gap-1.5 text-sm text-muted sm:flex">
            <LayoutGrid size={16} /> 共 {total} 个模板
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {TEMPLATE_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                setCategory(cat)
                setPage(1)
              }}
              className={cn('pill-tag', category === cat && 'active')}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* 网格 */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="panel-card overflow-hidden">
              <div className="aspect-[4/3] animate-pulse bg-white/8" />
              <div className="space-y-2 p-3">
                <div className="h-4 w-2/3 animate-pulse rounded bg-white/8" />
                <div className="h-3 w-1/3 animate-pulse rounded bg-white/8" />
              </div>
            </div>
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="panel-card flex flex-col items-center justify-center gap-2 py-16 text-center">
          <Sparkles size={28} className="text-muted" />
          <p className="text-sm text-muted">没有找到匹配的模板</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {list.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => setDetail(tpl)}
              className="panel-card group overflow-hidden text-left transition-all hover:-translate-y-0.5 hover:border-blue/40"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-panel-2">
                {tpl.coverUrl ? (
                  <img
                    src={tpl.coverUrl}
                    alt={tpl.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted/40">
                    <Sparkles size={32} />
                  </div>
                )}
                <span className="absolute right-2 top-2">
                  <Tag tone="blue">{tpl.category}</Tag>
                </span>
              </div>
              <div className="p-3">
                <h3 className="truncate text-sm font-semibold text-text">{tpl.title}</h3>
                <p className="mt-1 truncate text-xs text-muted">{tpl.businessType}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 分页 */}
      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="btn-secondary h-8 w-8 !px-0 disabled:opacity-40"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm text-muted">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="btn-secondary h-8 w-8 !px-0 disabled:opacity-40"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {isFetching && !isLoading && (
        <div className="flex items-center justify-center gap-2 text-xs text-muted">
          <Loader2 size={14} className="animate-spin" /> 加载中…
        </div>
      )}

      {/* 模板详情 Dialog */}
      <Dialog
        open={!!detail}
        onOpenChange={(o) => !o && setDetail(null)}
        title={detail?.title}
        description={detail ? `分类：${detail.category} · 业务类型：${detail.businessType}` : undefined}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setDetail(null)}>
              关闭
            </button>
            <button className="btn-primary" onClick={() => setDetail(null)}>
              <Sparkles size={15} /> 使用此模板
            </button>
          </>
        }
      >
        {detail && (
          <div className="space-y-4">
            {detail.coverUrl && (
              <img
                src={detail.coverUrl}
                alt={detail.title}
                className="aspect-[16/9] w-full rounded-btn border border-border object-cover"
              />
            )}
            <div>
              <p className="mb-2 text-sm font-medium text-muted">提示词内容</p>
              <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-btn bg-panel-2 p-3 text-xs leading-relaxed text-text/90">
                {detail.prompt}
              </pre>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
