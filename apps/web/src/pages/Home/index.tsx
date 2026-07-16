import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  ImagePlus,
  Loader2,
  Paintbrush,
  RotateCcw,
  ScanText,
  Send,
  Settings2,
  Sparkles,
  Upload,
  Wand2,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { useAuthStore, useCreditStore } from '@/stores'
import {
  creditApi,
  imageJobApi,
  capabilityApi,
  type ProviderCapabilities,
} from '@/services/api'
import type { TextCorrection, TextValidationCheck } from '@/types'
import {
  BUSINESS_TYPES,
  DEFAULT_MATERIAL,
  DEFAULT_NEED,
  DEFAULT_STYLE,
  IMAGE_QUALITY_OPTIONS,
  IMAGE_SIZE_PRESETS,
  MATERIAL_OPTIONS,
  MODEL_OPTIONS,
  OTHERS_VALUE,
  STYLE_OPTIONS,
} from './workbench.constants'
import { appUrl, extractStoreName, requestedVisibleTexts } from './workbench.utils'
import {
  useGenerationStore,
  firstAsset,
  sourceAsset,
  textValidation,
  correctionFromCheck,
  type JobWithResponse,
} from '@/stores/generation'
import { usePromptSeed } from '@/stores/promptSeed'
import { shouldAutoSelectMockMode } from './run-mode'

type RunMode = 'mock' | 'live'

function CompactSelect({
  label,
  value,
  onChange,
  disabled,
  options,
  className,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  options: { value: string; label: string; disabled?: boolean }[]
  className?: string
}) {
  return (
    <label className={cn('min-w-0 flex-1', className)}>
      <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="h-8 w-full max-w-full rounded-md border border-border bg-bg px-1.5 text-[11px] outline-none focus:border-blue/60 sm:px-2 sm:text-xs"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export default function HomePage() {
  const navigate = useNavigate()
  const token = useAuthStore((state) => state.token)
  const balance = useCreditStore((state) => state.balance)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const [customerText, setCustomerText] = useState(DEFAULT_NEED)
  const [requiredTextInput, setRequiredTextInput] = useState('')
  const [businessType, setBusinessType] = useState('storefront_sign')
  const [material, setMaterial] = useState(DEFAULT_MATERIAL)
  const [materialCustom, setMaterialCustom] = useState('')
  const [style, setStyle] = useState(DEFAULT_STYLE)
  const [styleCustom, setStyleCustom] = useState('')
  const [model, setModel] = useState(MODEL_OPTIONS[0].code)
  const [runMode, setRunMode] = useState<RunMode>('live')
  const [ratio, setRatio] = useState('16:9')
  const [quality, setQuality] = useState('high')
  const [count] = useState(1)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const [environmentFile, setEnvironmentFile] = useState<File | null>(null)
  const [environmentPreview, setEnvironmentPreview] = useState('')
  const [validating, setValidating] = useState(false)
  const [correcting, setCorrecting] = useState(false)
  const [creditRules, setCreditRules] = useState<Record<string, number>>({})
  const [capabilities, setCapabilities] = useState<ProviderCapabilities | null>(null)
  /** 仅在通过校验并真正开始生成后写入，避免草稿被当成已发送消息 */
  const [lastSubmittedText, setLastSubmittedText] = useState('')
  const [lastSubmittedVisible, setLastSubmittedVisible] = useState<string[]>([])

  const seedPrompt = usePromptSeed((s) => s.seedPrompt)
  const clearSeedPrompt = usePromptSeed((s) => s.clearSeedPrompt)
  useEffect(() => {
    if (seedPrompt && seedPrompt.trim()) {
      setCustomerText(seedPrompt.trim())
      clearSeedPrompt()
      toast.success('已将该提示词填入客户需求')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedPrompt])

  useEffect(() => {
    void creditApi
      .rules()
      .then((response) => setCreditRules(response.data))
      .catch(() => undefined)
    void capabilityApi
      .get()
      .then((response) => {
        setCapabilities(response.data)
        if (shouldAutoSelectMockMode(response.data)) {
          setRunMode('mock')
        }
      })
      .catch(() => setCapabilities({ mock: false, textGeneration: false, imageGeneration: false, composition: true }))
  }, [])

  const {
    busy,
    projectId,
    promptText,
    originalPromptText,
    activeTab,
    originalJob,
    composedJob,
    vectorAsset,
    environmentAsset,
    showSourceImage,
    correctionDraft,
    error: generationError,
    lastGenerateConfig,
    setActiveTab,
    setPromptText,
    setShowSourceImage,
    setCorrectionDraft,
    setEnvironmentAsset,
    updateOriginalJob,
    updateComposedJob,
    generate,
    regenerateWithPrompt,
    retryLast,
  } = useGenerationStore()

  const visibleTexts = useMemo(
    () => requestedVisibleTexts(customerText, requiredTextInput),
    [customerText, requiredTextInput],
  )
  const storeName = useMemo(() => extractStoreName(customerText), [customerText])
  const materialValue = material === OTHERS_VALUE ? materialCustom.trim() : material
  const styleValue = style === OTHERS_VALUE ? styleCustom.trim() : style
  const activeJob = activeTab === 'composed' ? composedJob : activeTab === 'original' ? originalJob : null
  const selectedAsset =
    activeTab === 'vector'
      ? vectorAsset
      : showSourceImage
        ? sourceAsset(activeJob)
        : firstAsset(activeJob)
  const selectedImage = appUrl(selectedAsset?.url) || (activeTab === 'composed' ? environmentPreview : undefined)
  const failedJob =
    originalJob?.status === 'failed'
      ? originalJob
      : composedJob?.status === 'failed'
        ? composedJob
        : null
  const failureMessage =
    generationError ||
    failedJob?.errorMessage ||
    (failedJob ? '生成未成功，请重试' : undefined)
  const showFailure = Boolean(failureMessage) && !busy && !selectedImage
  const validation = textValidation(activeJob)
  const checks: TextValidationCheck[] =
    validation?.checks ||
    visibleTexts.map((expectedText) => ({
      expectedText,
      matched: false,
    }))
  const estimate = useMemo(() => {
    const brief = 1
    const image = (creditRules.imageGeneration ?? 2) * count
    const composition = environmentFile || environmentAsset ? creditRules.composition ?? 1 : 0
    const svg = creditRules.exportSvg ?? 1
    return brief + image + composition + svg
  }, [count, creditRules, environmentAsset, environmentFile])
  const liveAvailable = Boolean(capabilities?.textGeneration && capabilities?.imageGeneration)
  const mockAvailable = Boolean(capabilities?.mock)
  const insufficientBalance = runMode === 'live' && balance < estimate
  const businessLabel = BUSINESS_TYPES.find((b) => b.id === businessType)?.title || businessType

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [lastSubmittedText, promptText, busy, originalJob?.status, composedJob?.status])

  const pipeline = useMemo(
    () => [
      {
        id: 'ae',
        label: '需求',
        done: Boolean(promptText),
        active: busy && !promptText,
        detail: promptText ? '需求已整理' : '等待你的描述',
      },
      {
        id: 'strategy',
        label: '策略',
        done: Boolean(promptText),
        active: false,
        detail: styleValue || '风格方向',
      },
      {
        id: 'creative',
        label: '创意',
        done: Boolean(promptText),
        active: false,
        detail: materialValue || '材质方向',
      },
      {
        id: 'visual',
        label: '生图',
        done: originalJob?.status === 'succeeded',
        active: busy || originalJob?.status === 'queued' || originalJob?.status === 'processing',
        detail:
          originalJob?.status === 'succeeded'
            ? '效果图已完成'
            : originalJob?.status === 'failed'
              ? '生成未成功'
              : originalJob?.status === 'queued' || originalJob?.status === 'processing'
                ? '正在出图'
                : '待生成',
      },
      {
        id: 'compose',
        label: '合成',
        done: composedJob?.status === 'succeeded',
        active: composedJob?.status === 'queued' || composedJob?.status === 'processing',
        detail: environmentFile || environmentAsset
          ? composedJob?.status === 'succeeded'
            ? '环境合成完成'
            : composedJob?.status === 'failed'
              ? '合成未成功'
              : '待合成'
          : '未上传环境图',
      },
      {
        id: 'export',
        label: '矢量',
        done: Boolean(vectorAsset),
        active: false,
        detail: vectorAsset ? '矢量稿已出' : '待导出',
      },
    ],
    [
      busy,
      promptText,
      styleValue,
      materialValue,
      originalJob?.status,
      composedJob?.status,
      environmentFile,
      environmentAsset,
      vectorAsset,
    ],
  )

  async function handleGenerate() {
    if (!customerText.trim()) {
      toast.error('请先填写客户需求')
      return
    }
    if (!token) {
      toast.error('请先登录后再生成')
      navigate('/login')
      return
    }
    if (runMode === 'live' && !liveAvailable) {
      toast.error('高清生图暂不可用，请联系管理员配置图像服务')
      return
    }
    if (runMode === 'mock' && !mockAvailable) {
      toast.error('快速预览不可用')
      return
    }
    if (insufficientBalance) {
      toast.error(`积分不足：当前 ${balance}，预计需要 ${estimate}`)
      return
    }

    // 仅在真正开跑前写入对话「你」的消息；能力/积分阻断不入对话
    setLastSubmittedText(customerText.trim())
    setLastSubmittedVisible(visibleTexts)

    await generate({
      businessType,
      customerText,
      materialValue,
      styleValue,
      ratio,
      quality,
      visibleTexts,
      count,
      model,
      mock: runMode === 'mock',
      environmentFile,
      environmentAsset,
    })
  }

  async function handleRegenerateWithPrompt() {
    if (runMode === 'live' && !liveAvailable) {
      toast.error('高清生图暂不可用，请联系管理员配置图像服务')
      return
    }
    if (runMode === 'mock' && !mockAvailable) {
      toast.error('快速预览不可用')
      return
    }
    if (insufficientBalance) {
      toast.error(`积分不足：当前 ${balance}，预计需要 ${estimate}`)
      return
    }
    if (!projectId || !promptText.trim()) {
      await handleGenerate()
      return
    }
    await regenerateWithPrompt({
      projectId,
      promptText,
      mock: runMode === 'mock',
      environmentAsset,
      visibleTexts,
    })
  }

  function applySuggestion(chip: string) {
    const base = customerText.trim()
    if (!base) {
      setCustomerText(chip)
      return
    }
    if (base.includes(chip)) return
    setCustomerText(`${base}，${chip}`)
  }

  function getSeedImageUrl(): string | undefined {
    const asset = firstAsset(originalJob) || firstAsset(composedJob)
    return asset?.url
  }

  async function handleRegenerateToEditor() {
    if (!projectId || (!originalJob && !composedJob)) {
      await handleGenerate()
      return
    }
    const seedUrl = getSeedImageUrl()
    if (!seedUrl) {
      toast.error('暂无可携带的生成图，请先生成方案')
      return
    }
    const params = new URLSearchParams()
    params.set('seedImg', seedUrl)
    params.set('polishPrompt', promptText || '')
    navigate(`/editor/${projectId}?${params.toString()}`)
  }

  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (environmentPreview.startsWith('blob:')) URL.revokeObjectURL(environmentPreview)
    setEnvironmentFile(file)
    setEnvironmentPreview(URL.createObjectURL(file))
    setEnvironmentAsset(null)
    setActiveTab('composed')
    toast.success('环境图已就绪，生成时将自动合成')
  }

  async function handleValidateText() {
    if (!activeJob) return
    setValidating(true)
    try {
      const response = await imageJobApi.validateText(activeJob.id)
      const updated = response.data.job as JobWithResponse
      if (activeJob.jobType === 'composition') updateComposedJob(updated)
      else updateOriginalJob(updated)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '文字核对失败')
    } finally {
      setValidating(false)
    }
  }

  async function handleApplyCorrection() {
    if (!activeJob || !correctionDraft) return
    setCorrecting(true)
    try {
      const response = await imageJobApi.applyTextCorrections(activeJob.id, [correctionDraft])
      const updated = response.data.job as JobWithResponse
      if (activeJob.jobType === 'composition') updateComposedJob(updated)
      else updateOriginalJob(updated)
      setShowSourceImage(false)
      setCorrectionDraft(null)
      toast.success('文字校正图已生成')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '文字重绘失败')
    } finally {
      setCorrecting(false)
    }
  }

  function handleDownload() {
    if (!selectedImage) return
    const link = document.createElement('a')
    link.href = selectedImage
    link.download = `adcraft-${activeTab}-${storeName}-${Date.now()}.${activeTab === 'vector' ? 'svg' : 'png'}`
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  async function handleCopyPrompt() {
    if (!promptText.trim()) return
    await navigator.clipboard.writeText(promptText)
    toast.success('生图描述已复制')
  }

  const modeHint = !capabilities
    ? '正在检查服务状态…'
    : runMode === 'mock'
      ? mockAvailable
        ? '快速生成示意图，不消耗积分'
        : '快速预览不可用'
      : liveAvailable
        ? insufficientBalance
          ? `积分不足 ${balance}/${estimate}`
          : `预计 ${estimate} 积分 · 余额 ${balance}`
        : '高清生图暂不可用'

  const SUGGESTION_CHIPS = ['突出店名', '夜间发光效果', '保持中文准确'] as const

  const modelLabel = MODEL_OPTIONS.find((m) => m.code === model)?.name || model
  const qualityLabel = IMAGE_QUALITY_OPTIONS.find((q) => q.value === quality)?.label || quality

  return (
    <div className="w-full bg-bg lg:flex lg:h-[calc(100dvh-3.5rem)] lg:min-h-0 lg:flex-row lg:overflow-hidden">
      {/* —— 左：Agent 对话 + Composer —— */}
      {/* 移动：自然高度纵向排版；桌面：固定高度双栏内滚动 */}
      <section className="relative z-10 w-full border-b border-border bg-bg lg:flex lg:h-full lg:w-[min(420px,42vw)] lg:shrink-0 lg:flex-col lg:overflow-hidden lg:border-b-0 lg:border-r">
        {/* 会话上下文 */}
        <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 lg:shrink-0">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text">{storeName} · 工作会话</p>
            <p className="truncate text-[11px] text-muted">
              {businessLabel}
              {projectId ? ` · ${projectId.slice(0, 8)}…` : ' · 未建项目'}
            </p>
          </div>
          <span
            className={cn(
              'shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-medium',
              runMode === 'live'
                ? 'border-amber/40 bg-amber/10 text-amber'
                : 'border-green/40 bg-green/10 text-green',
            )}
          >
            {runMode === 'live' ? '高清生图' : '快速预览'}
          </span>
        </header>

        {/* 轻量状态轨 */}
        <div className="overflow-x-auto border-b border-border px-2 py-2 lg:shrink-0">
          <ol className="flex min-w-max items-center gap-0.5">
            {pipeline.map((step, i) => (
              <li key={step.id} className="flex items-center">
                <div
                  className={cn(
                    'flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px]',
                    step.done && 'text-green',
                    step.active && 'bg-blue/15 text-blue',
                    !step.done && !step.active && 'text-muted',
                  )}
                  title={step.detail}
                >
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      step.done && 'bg-green',
                      step.active && 'animate-pulse bg-blue',
                      !step.done && !step.active && 'bg-white/20',
                    )}
                  />
                  {step.label}
                </div>
                {i < pipeline.length - 1 ? <span className="mx-0.5 h-px w-2 bg-border" /> : null}
              </li>
            ))}
          </ol>
        </div>

        {/* 对话流：仅展示已提交消息；草稿只在下方 composer */}
        <div className="space-y-3 px-3 py-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          {/* 设计助手开场（始终可见，简洁） */}
          <div className="mr-4 rounded-md border border-border bg-panel/50 px-3 py-2.5">
            <span className="mb-1 flex items-center gap-1 text-[10px] font-medium text-muted">
              <Sparkles className="h-3 w-3 text-blue" /> 设计助手
            </span>
            <p className="text-xs leading-relaxed text-text">
              告诉我门店类型、店名和想要的风格，我会整理成可生成的设计方案。
            </p>
            {!lastSubmittedText ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {SUGGESTION_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    disabled={busy}
                    onClick={() => applySuggestion(chip)}
                    className="rounded-md border border-border bg-bg/60 px-2 py-0.5 text-[10px] text-muted hover:border-blue/40 hover:text-text"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {lastSubmittedText ? (
            <div className="ml-6 rounded-md border border-border bg-panel/80 px-3 py-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[10px] font-medium text-muted">你</span>
                <span className="text-[10px] text-muted">{lastSubmittedText.length} 字</span>
              </div>
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-text">{lastSubmittedText}</p>
              {lastSubmittedVisible.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {lastSubmittedVisible.map((t) => (
                    <span key={t} className="rounded border border-amber/30 bg-amber/10 px-1.5 py-0.5 text-[10px] text-amber">
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {busy ? (
            <div className="mr-4 flex gap-2 rounded-md border border-blue/30 bg-blue/10 px-3 py-2">
              <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-blue" />
              <div>
                <p className="text-xs font-medium text-text">设计助手正在整理方案…</p>
                <p className="mt-0.5 text-[11px] text-muted">整理需求 · 生成效果图 · 可选环境合成</p>
              </div>
            </div>
          ) : null}

          {promptText ? (
            <div className="mr-4 space-y-2 rounded-md border border-border bg-panel/60 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1 text-[10px] font-medium text-muted">
                  <Sparkles className="h-3 w-3 text-blue" /> 设计助手 · 生图描述
                </span>
                <div className="flex gap-1">
                  <button type="button" onClick={handleCopyPrompt} className="btn-secondary h-7 gap-1 !px-2 text-[10px]" title="复制">
                    <Copy className="h-3 w-3" />
                    复制
                  </button>
                  <button
                    type="button"
                    onClick={() => setPromptText(originalPromptText)}
                    className="btn-secondary h-7 gap-1 !px-2 text-[10px]"
                    title="恢复助手原文"
                  >
                    <RotateCcw className="h-3 w-3" />
                    重置
                  </button>
                </div>
              </div>
              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                rows={5}
                className="w-full resize-y rounded-md border border-border bg-bg/80 p-2 text-[11px] leading-relaxed text-text outline-none focus:border-blue/50"
              />
              <button
                type="button"
                onClick={handleRegenerateWithPrompt}
                disabled={busy || !capabilities}
                className="btn-primary h-8 w-full gap-1.5 text-xs"
              >
                <Send className="h-3.5 w-3.5" />
                按此描述重新生图
              </button>
            </div>
          ) : null}

          {(originalJob || composedJob || vectorAsset) && !busy ? (
            <div className="mr-4 rounded-md border border-border bg-panel/40 px-3 py-2 text-[11px] text-muted">
              {originalJob?.status === 'succeeded' ? '效果图已完成 · ' : null}
              {composedJob?.status === 'succeeded' ? '环境合成完成 · ' : null}
              {vectorAsset ? '矢量稿已导出' : '可在右侧查看结果'}
            </div>
          ) : null}
          <div ref={chatEndRef} />
        </div>

        {/* Prompt Composer：移动完整展开；桌面贴底 shrink-0 */}
        <div className="relative z-10 border-t border-border bg-panel/50 px-3 py-2.5 lg:shrink-0 lg:overflow-y-auto lg:max-h-[52%]">
          <div className="space-y-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-medium text-muted">客户需求</span>
              <textarea
                value={customerText}
                onChange={(e) => setCustomerText(e.target.value)}
                rows={3}
                disabled={busy}
                placeholder="一句话描述门店、店名、风格…"
                className="w-full resize-none rounded-md border border-border bg-bg px-2.5 py-2 text-xs leading-relaxed outline-none focus:border-blue/50"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-medium text-muted">需原样显示的文字</span>
              <textarea
                value={requiredTextInput}
                onChange={(e) => setRequiredTextInput(e.target.value)}
                rows={2}
                disabled={busy}
                placeholder="每行一条，如：不晚 STUDIO"
                className="w-full resize-none rounded-md border border-border bg-bg px-2.5 py-2 text-xs outline-none focus:border-blue/50"
              />
            </label>

            {/* 模式 chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setRunMode('mock')
                  if (capabilities && !mockAvailable) toast.error('快速预览不可用')
                }}
                className={cn(
                  'h-7 rounded-md border px-2.5 text-[11px]',
                  runMode === 'mock'
                    ? 'border-green/50 bg-green/15 text-text'
                    : 'border-border bg-transparent text-muted hover:bg-white/5',
                )}
              >
                快速预览
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setRunMode('live')
                  if (capabilities && !liveAvailable) {
                    toast.error('高清生图暂不可用，请联系管理员配置图像服务')
                  }
                }}
                className={cn(
                  'h-7 rounded-md border px-2.5 text-[11px]',
                  runMode === 'live'
                    ? 'border-amber/50 bg-amber/15 text-amber'
                    : 'border-border bg-transparent text-muted hover:bg-white/5',
                )}
              >
                高清生图
              </button>
              <span
                className={cn(
                  'min-w-0 basis-full text-[10px] sm:basis-auto',
                  (runMode === 'live' && !liveAvailable) || (runMode === 'mock' && !mockAvailable) || insufficientBalance
                    ? 'text-amber'
                    : 'text-muted',
                )}
              >
                {modeHint}
              </span>
            </div>

            {/* 主参数行：390 保证三列可读 */}
            <div className="grid grid-cols-3 gap-1.5">
              <CompactSelect
                label="业务"
                value={businessType}
                onChange={setBusinessType}
                disabled={busy}
                options={BUSINESS_TYPES.map((b) => ({ value: b.id, label: b.title }))}
              />
              <label className="min-w-0">
                <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted">材质</span>
                <select
                  value={material}
                  onChange={(e) => setMaterial(e.target.value)}
                  disabled={busy}
                  className="h-8 w-full max-w-full rounded-md border border-border bg-bg px-1.5 text-[11px] outline-none sm:px-2 sm:text-xs"
                >
                  {MATERIAL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {material === OTHERS_VALUE ? (
                  <input
                    value={materialCustom}
                    onChange={(e) => setMaterialCustom(e.target.value)}
                    placeholder="自定义材质"
                    disabled={busy}
                    className="mt-1 h-7 w-full rounded-md border border-border bg-bg px-2 text-xs outline-none"
                  />
                ) : null}
              </label>
              <label className="min-w-0">
                <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted">风格</span>
                <select
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                  disabled={busy}
                  className="h-8 w-full max-w-full rounded-md border border-border bg-bg px-1.5 text-[11px] outline-none sm:px-2 sm:text-xs"
                >
                  {STYLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {style === OTHERS_VALUE ? (
                  <input
                    value={styleCustom}
                    onChange={(e) => setStyleCustom(e.target.value)}
                    placeholder="自定义风格"
                    disabled={busy}
                    className="mt-1 h-7 w-full rounded-md border border-border bg-bg px-2 text-xs outline-none"
                  />
                ) : null}
              </label>
            </div>

            {/* 高级：模型 / 尺寸 / 质量（默认折叠） */}
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex w-full items-start justify-between gap-2 rounded-md border border-border bg-bg/50 px-2 py-1.5 text-left text-[11px] text-muted hover:text-text"
            >
              <span className="min-w-0 flex-1">
                <span className="inline-flex items-center gap-1 font-medium text-text/90">
                  <Settings2 className="h-3.5 w-3.5 shrink-0" />
                  模型 · 尺寸 · 质量
                </span>
                <span className="mt-0.5 block truncate text-[10px] text-muted">
                  {modelLabel} · {ratio} · {qualityLabel}
                </span>
              </span>
              <ChevronDown className={cn('mt-0.5 h-3.5 w-3.5 shrink-0 transition', advancedOpen && 'rotate-180')} />
            </button>
            {advancedOpen ? (
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-border bg-bg/40 p-2 lg:max-h-40">
                <CompactSelect
                  label="生图模型"
                  value={model}
                  onChange={setModel}
                  disabled={busy}
                  options={MODEL_OPTIONS.map((m) => ({
                    value: m.code,
                    label: m.name,
                    disabled: m.reserved,
                  }))}
                />
                <div>
                  <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted">输出尺寸</span>
                  <div className="flex flex-wrap gap-1">
                    {IMAGE_SIZE_PRESETS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={busy}
                        onClick={() => setRatio(opt.value)}
                        className={cn(
                          'h-7 rounded-md border px-2 text-[11px]',
                          ratio === opt.value
                            ? 'border-blue/50 bg-blue/15 text-text'
                            : 'border-border text-muted hover:bg-white/5',
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted">生成质量</span>
                  <div className="flex flex-wrap gap-1">
                    {IMAGE_QUALITY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={busy}
                        onClick={() => setQuality(opt.value)}
                        className={cn(
                          'h-7 rounded-md border px-2 text-[11px]',
                          quality === opt.value
                            ? 'border-blue/50 bg-blue/15 text-text'
                            : 'border-border text-muted hover:bg-white/5',
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="grid w-full grid-cols-2 gap-1.5">
              <label
                className={cn(
                  'inline-flex h-9 min-w-0 cursor-pointer items-center justify-center gap-1 rounded-btn border border-border bg-white/5 px-2 text-[11px] text-muted',
                  busy && 'pointer-events-none opacity-55',
                )}
              >
                <Upload className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{environmentFile || environmentAsset ? '已选环境' : '上传环境图'}</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleUpload} disabled={busy} />
              </label>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={busy || !capabilities}
                className="inline-flex h-9 min-w-0 items-center justify-center gap-1 rounded-btn bg-gradient-to-r from-blue to-[#7cc7ff] px-2 text-[11px] font-semibold text-[#07121d] disabled:opacity-55"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 shrink-0" />}
                生成方案
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* —— 右：结果画布 —— */}
      {/* 移动：块级自然高度、min-height 稳定；桌面：flex-1 填满 */}
      <section className="relative z-0 flex w-full min-w-0 flex-col bg-bg lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-hidden">
        <div className="flex flex-col gap-1.5 border-b border-border px-2 py-1.5 sm:px-3 lg:shrink-0">
          <div className="flex flex-wrap items-center gap-1">
            {(
              [
                ['composed', '真实环境图'],
                ['original', '广告原图'],
                ['vector', '矢量图'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={cn(
                  'h-8 shrink-0 rounded-md px-2.5 text-xs',
                  activeTab === id ? 'bg-white/10 text-text' : 'text-muted hover:bg-white/5 hover:text-text',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {projectId ? (
              <>
                <button
                  type="button"
                  onClick={() => navigate(`/projects/${projectId}`)}
                  className="btn-secondary h-8 gap-1 !px-2.5 text-xs"
                  title="打开本次生成关联的项目"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  打开项目
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const seed = getSeedImageUrl()
                    const params = new URLSearchParams()
                    if (seed) params.set('seedImg', seed)
                    if (promptText) params.set('polishPrompt', promptText)
                    const q = params.toString()
                    navigate(`/editor/${projectId}${q ? `?${q}` : ''}`)
                  }}
                  className="btn-secondary h-8 gap-1 !px-2.5 text-xs"
                  title="在画布中继续编辑"
                >
                  <Paintbrush className="h-3.5 w-3.5" />
                  打开画布
                </button>
              </>
            ) : null}
            <button type="button" disabled={!selectedImage} onClick={handleDownload} className="btn-secondary h-8 gap-1 !px-2.5 text-xs">
              <Download className="h-3.5 w-3.5" />
              下载
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleRegenerateToEditor}
              title="携带效果图与生图描述进入画布"
              className="btn-secondary h-8 gap-1 !px-2.5 text-xs"
            >
              <Paintbrush className="h-3.5 w-3.5" />
              进画布
            </button>
          </div>
        </div>

        {projectId ? (
          <div className="border-b border-border bg-panel/20 px-3 py-1.5 text-[11px] text-muted">
            本次结果已关联项目{' '}
            <button type="button" className="text-blue hover:underline" onClick={() => navigate(`/projects/${projectId}`)}>
              {storeName || '未命名'}
            </button>
            ，可随时打开项目或画布继续编辑。
          </div>
        ) : null}

        <div className="relative aspect-[4/3] w-full min-h-[220px] bg-[#0a0c10] sm:min-h-[260px] lg:aspect-auto lg:min-h-0 lg:flex-1">
          {busy ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted">
              <Loader2 className="h-9 w-9 animate-spin text-blue" />
              <p className="text-sm text-text">正在生成设计方案…</p>
              <p className="text-[11px]">整理需求 · 出图 · 可选环境合成</p>
            </div>
          ) : showFailure ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center">
              <AlertTriangle className="h-10 w-10 text-amber" />
              <p className="text-sm font-semibold text-text">生成未成功</p>
              <p className="max-w-md text-xs leading-relaxed text-muted break-words">{failureMessage}</p>
              <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  disabled={busy || !lastGenerateConfig}
                  onClick={() => void retryLast()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-btn bg-gradient-to-r from-blue to-[#7cc7ff] px-3 text-xs font-semibold text-[#07121d] disabled:opacity-55"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  使用相同参数重试
                </button>
                {projectId ? (
                  <button type="button" onClick={() => navigate(`/projects/${projectId}`)} className="btn-secondary h-9 gap-1 text-xs">
                    <FolderOpen className="h-3.5 w-3.5" />
                    查看项目
                  </button>
                ) : null}
              </div>
            </div>
          ) : selectedImage ? (
            <div className="absolute inset-0 flex items-center justify-center p-2 sm:p-4">
              <img src={selectedImage} alt="生成结果" className="max-h-full max-w-full object-contain" />
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted">
              <ImagePlus className="h-10 w-10 opacity-40" />
              <p className="text-sm">结果画布</p>
              <p className="max-w-[240px] px-4 text-center text-[11px]">填写需求后点「生成方案」，预览将显示在此</p>
            </div>
          )}
        </div>

        {/* OCR / 活动条 */}
        {activeJob && activeTab !== 'vector' ? (
          <div className="max-h-64 overflow-y-auto border-t border-border bg-panel/30 px-3 py-2 lg:max-h-[32%] lg:shrink-0">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-text">文字核对与修正</p>
                <p className="text-[10px] text-muted">
                  {validation?.status === 'passed'
                    ? '店名文字已核对通过'
                    : validation?.status === 'needs_review'
                      ? '发现需复核的文字'
                      : validation?.status === 'unavailable'
                        ? '文字核对服务暂不可用'
                        : '可核对图中文字是否准确'}
                </p>
              </div>
              <div className="flex gap-1">
                {activeJob.responseJson?.correctedAssets?.length ? (
                  <button
                    type="button"
                    onClick={() => setShowSourceImage(!showSourceImage)}
                    className="btn-secondary h-7 gap-1 !px-2 text-[10px]"
                  >
                    {showSourceImage ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    {showSourceImage ? '校正图' : '原图'}
                  </button>
                ) : null}
                <button type="button" onClick={handleValidateText} disabled={validating} className="btn-secondary h-7 gap-1 !px-2 text-[10px]">
                  {validating ? <Loader2 className="h-3 w-3 animate-spin" /> : <ScanText className="h-3 w-3" />}
                  {validation ? '重新核对' : '核对文字'}
                </button>
              </div>
            </div>
            {validation?.error ? (
              <div className="mb-2 flex items-center gap-1.5 rounded-md border border-amber/30 bg-amber/10 px-2 py-1.5 text-[10px] text-amber">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                {validation.error}
              </div>
            ) : null}
            <div className="space-y-1">
              {checks.length ? (
                checks.map((check) => (
                  <div
                    key={check.expectedText}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-md border px-2 py-1.5',
                      check.matched ? 'border-green/25 bg-green/5' : 'border-amber/25 bg-amber/5',
                    )}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-text">{check.expectedText}</p>
                      <p className="truncate text-[10px] text-muted">
                        {check.detectedText
                          ? `识别结果：${check.detectedText}${check.confidence === undefined ? '' : ` · ${Math.round(check.confidence * 100)}%`}`
                          : '未识别到对应文字'}
                      </p>
                    </div>
                    {check.matched ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green" />
                    ) : (
                      <button
                        type="button"
                        className="btn-secondary h-7 shrink-0 !px-2 text-[10px]"
                        onClick={() => setCorrectionDraft(correctionFromCheck(check, validation))}
                      >
                        修正
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-[10px] text-muted">未设置需原样显示的文字</p>
              )}
            </div>
            {correctionDraft ? (
              <div className="mt-2 rounded-md border border-border bg-bg/60 p-2">
                <p className="mb-1.5 text-[10px] font-medium text-muted">修正：{correctionDraft.expectedText}</p>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                  {(['x', 'y', 'width', 'height', 'fontSize'] as const).map((key) => (
                    <label key={key} className="text-[10px] text-muted">
                      {key}
                      <input
                        type="number"
                        value={correctionDraft[key]}
                        onChange={(e) => setCorrectionDraft({ ...correctionDraft, [key]: Number(e.target.value) })}
                        className="mt-0.5 h-7 w-full rounded-md border border-border bg-bg px-1.5 text-xs text-text outline-none"
                      />
                    </label>
                  ))}
                </div>
                <div className="mt-2 flex gap-1.5">
                  <button type="button" onClick={handleApplyCorrection} disabled={correcting} className="btn-primary h-7 gap-1 text-[10px]">
                    {correcting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    生成校正图
                  </button>
                  <button type="button" onClick={() => setCorrectionDraft(null)} className="btn-secondary h-7 text-[10px]">
                    取消
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-1.5 text-[10px] text-muted">
            <span className="truncate">
              {selectedImage
                ? `${storeName} · ${activeTab === 'vector' ? '矢量' : activeTab === 'composed' ? '环境' : '原图'}`
                : '等待生成 · 上传环境图可启用合成'}
            </span>
            {(environmentFile || environmentAsset) && (
              <span className="shrink-0 rounded border border-border px-1.5 py-0.5">环境图已就绪</span>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
