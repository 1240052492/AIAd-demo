import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Copy, Sparkles, ChevronDown, ImageOff, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/utils/cn'
import { Tag } from '@/components/ui/Tag'
import { usePromptSeed } from '@/stores/promptSeed'

interface PromptItem {
  index: number
  title: string
  sourceLabel: string
  visibleText: string
  image: string
  imageUrl: string
  width: number
  height: number
  promptText: string
}

interface PromptData {
  source: string
  total: number
  items: PromptItem[]
}

type ImgStage = 0 | 1 | 2 // 0 本地图, 1 远程回退, 2 占位

function PromptCard({ item }: { item: PromptItem }) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)
  const [imgStage, setImgStage] = useState<ImgStage>(0)

  const handleUse = () => {
    usePromptSeed.getState().setSeedPrompt(item.promptText)
    navigate('/')
  }

  const handleCopy = () => {
    navigator.clipboard
      .writeText(item.promptText)
      .then(() => toast.success('已复制提示词'))
      .catch(() => toast.error('复制失败，请手动复制'))
  }

  const imgSrc = imgStage === 0 ? encodeURI(item.image) : imgStage === 1 ? item.imageUrl : ''

  return (
    <article className="flex flex-col overflow-hidden rounded-card border border-border bg-panel shadow-sm transition hover:shadow-md">
      <div className="relative aspect-video overflow-hidden bg-bg">
        {imgStage === 2 ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted">
            <ImageOff className="h-9 w-9" />
            <span className="text-xs">图片暂不可用</span>
          </div>
        ) : (
          <img
            src={imgSrc}
            alt={item.title}
            loading="lazy"
            onError={() => setImgStage((s) => (s === 0 ? 1 : 2))}
            className="h-full w-full object-cover"
          />
        )}
        <div className="absolute left-2 top-2">
          <Tag tone="blue" dot>
            {item.sourceLabel}
          </Tag>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <h3 className="text-base font-semibold text-text">{item.title}</h3>

        <p
          className={cn(
            'whitespace-pre-line text-sm leading-relaxed text-muted',
            !expanded && 'line-clamp-3',
          )}
        >
          {item.promptText}
        </p>
        {item.promptText.split('\n').length > 3 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 self-start text-xs font-medium text-blue transition hover:text-[#7cc7ff]"
          >
            {expanded ? '收起' : '展开'}
            <ChevronDown className={cn('h-3.5 w-3.5 transition', expanded && 'rotate-180')} />
          </button>
        )}

        <div className="mt-auto flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-pill border border-border bg-bg px-3 py-2 text-sm font-medium text-text transition hover:border-blue hover:text-blue"
          >
            <Copy className="h-4 w-4" />
            复制
          </button>
          <button
            type="button"
            onClick={handleUse}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-pill bg-blue px-3 py-2 text-sm font-medium text-white transition hover:bg-[#3a8bff]"
          >
            <Sparkles className="h-4 w-4" />
            使用此提示词
          </button>
        </div>
      </div>
    </article>
  )
}

export default function PromptLibrary() {
  const [data, setData] = useState<PromptData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [query, setQuery] = useState('')
  const [source, setSource] = useState('全部')

  const load = () => {
    setLoading(true)
    setError(null)
    fetch('/prompts/data.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((json: PromptData) => {
        setData(json)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err : new Error('加载失败'))
        setLoading(false)
      })
  }

  useEffect(() => {
    load()
  }, [])

  const sourceLabels = useMemo(() => {
    if (!data) return ['全部']
    const set = new Set(data.items.map((i) => i.sourceLabel))
    return ['全部', ...Array.from(set)]
  }, [data])

  const filtered = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    return data.items.filter((item) => {
      const matchSource = source === '全部' || item.sourceLabel === source
      if (!matchSource) return false
      if (!q) return true
      return (
        item.title.toLowerCase().includes(q) ||
        item.visibleText.toLowerCase().includes(q) ||
        item.promptText.toLowerCase().includes(q)
      )
    })
  }, [data, query, source])

  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto max-w-[1200px] px-6 py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-text">提示词库</h1>
          <p className="mt-1 text-sm text-muted">
            精选广告设计提示词，一键复用至生成器
          </p>
        </header>

        <div className="mb-5 flex flex-col gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索标题、标签或提示词正文…"
              className="w-full rounded-pill border border-border bg-panel py-2.5 pl-10 pr-4 text-sm text-text placeholder:text-muted outline-none transition focus:border-blue"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {sourceLabels.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => setSource(label)}
                className={cn(
                  'rounded-pill border px-3 py-1.5 text-sm font-medium transition',
                  source === label
                    ? 'border-blue bg-blue text-white'
                    : 'border-border bg-panel text-muted hover:border-blue hover:text-blue',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted">
            <Loader2 className="h-8 w-8 animate-spin text-blue" />
            <span className="text-sm">正在加载提示词库…</span>
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-border bg-panel py-20 text-center">
            <ImageOff className="h-10 w-10 text-muted" />
            <p className="text-sm text-muted">提示词库加载失败</p>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-1.5 rounded-pill bg-blue px-4 py-2 text-sm font-medium text-white transition hover:bg-[#3a8bff]"
            >
              <RefreshCw className="h-4 w-4" />
              重试
            </button>
          </div>
        )}

        {data && !loading && !error && (
          <>
            <p className="mb-4 text-xs text-muted">
              共 {filtered.length} 条结果
            </p>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-border bg-panel py-20 text-center text-muted">
                <Search className="h-9 w-9" />
                <p className="text-sm">没有匹配的提示词，换个关键词试试</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                {filtered.map((item) => (
                  <PromptCard key={item.index} item={item} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
