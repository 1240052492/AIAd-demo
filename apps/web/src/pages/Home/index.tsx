import { ChangeEvent, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  Palette,
  RotateCcw,
  ScanText,
  Send,
  Sparkles,
  Upload,
  Wand2,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { useAuthStore } from '@/stores'
import {
  aiApi,
  compositionJobApi,
  creditApi,
  imageJobApi,
  projectApi,
  vectorAssetApi,
} from '@/services/api'
import type { Asset, GenerationJob, TextCorrection, TextValidationCheck, TextValidationRecord } from '@/types'
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
import { homeImageJobApi } from '@/services/home.api'
import { appUrl, createVectorSvg, extractStoreName, requestedVisibleTexts } from './workbench.utils'

type RunMode = 'mock' | 'live'
type ActiveTab = 'composed' | 'original' | 'vector'
type JobWithResponse = GenerationJob & {
  results?: Array<Asset & { assetId?: string }>
  responseJson?: {
    textValidation?: TextValidationRecord
    textCorrections?: TextCorrection[]
    correctedAssets?: Asset[]
    assetId?: string
    url?: string
  }
}

function PillToggle<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { label: string; value: T; detail?: string }[]
  value: T
  onChange: (value: T) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={cn('pill-tag h-auto min-h-8 flex-col items-start py-1.5', value === option.value && 'active')}
        >
          <span>{option.label}</span>
          {option.detail ? <span className="text-[10px] text-muted">{option.detail}</span> : null}
        </button>
      ))}
    </div>
  )
}

/** 下拉 + 预留「其他」自定义输入的通用选择组件 */
function SelectWithOther({
  label,
  options,
  value,
  customValue,
  onChange,
  onCustomChange,
  disabled,
}: {
  label: string
  options: { value: string; label: string }[]
  value: string
  customValue: string
  onChange: (value: string) => void
  onCustomChange: (value: string) => void
  disabled?: boolean
}) {
  const isOther = value === OTHERS_VALUE
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-muted">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="h-10 w-full rounded-card border border-border bg-bg px-3 text-sm outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {isOther ? (
        <input
          value={customValue}
          onChange={(event) => onCustomChange(event.target.value)}
          placeholder="请输入自定义内容"
          disabled={disabled}
          className="mt-2 h-10 w-full rounded-card border border-border bg-bg px-3 text-sm outline-none"
        />
      ) : null}
    </label>
  )
}

function firstAsset(job?: JobWithResponse | null): Asset | undefined {
  const corrected = job?.responseJson?.correctedAssets
  return (corrected?.length ? corrected[corrected.length - 1] : undefined) || job?.results?.[0]
}

function sourceAsset(job?: JobWithResponse | null): Asset | undefined {
  return job?.results?.[0]
}

function assetId(asset?: Asset & { assetId?: string }): string | undefined {
  return asset?.id || asset?.assetId
}

function textValidation(job?: JobWithResponse | null): TextValidationRecord | undefined {
  return job?.responseJson?.textValidation
}

function correctionFromCheck(check: TextValidationCheck, validation?: TextValidationRecord): TextCorrection {
  const region = validation?.regions.find((item) => item.id === check.regionId)
  if (!region?.polygon?.length) {
    return {
      expectedText: check.expectedText,
      regionId: check.regionId,
      x: 80,
      y: 80,
      width: 460,
      height: 120,
      fontSize: 72,
      textColor: '#111827',
      coverColor: '#ffffff',
    }
  }
  const xs = region.polygon.map((point) => point.x)
  const ys = region.polygon.map((point) => point.y)
  const x = Math.max(0, Math.floor(Math.min(...xs)))
  const y = Math.max(0, Math.floor(Math.min(...ys)))
  const width = Math.max(8, Math.ceil(Math.max(...xs) - Math.min(...xs)))
  const height = Math.max(8, Math.ceil(Math.max(...ys) - Math.min(...ys)))
  return {
    expectedText: check.expectedText,
    regionId: check.regionId,
    x,
    y,
    width,
    height,
    fontSize: Math.max(18, Math.round(height * 0.68)),
    textColor: '#111827',
    coverColor: '#ffffff',
  }
}

export default function HomePage() {
  const navigate = useNavigate()
  const token = useAuthStore((state) => state.token)

  const [customerText, setCustomerText] = useState(DEFAULT_NEED)
  const [requiredTextInput, setRequiredTextInput] = useState('')
  const [businessType, setBusinessType] = useState('storefront_sign')
  const [material, setMaterial] = useState(DEFAULT_MATERIAL)
  const [materialCustom, setMaterialCustom] = useState('')
  const [style, setStyle] = useState(DEFAULT_STYLE)
  const [styleCustom, setStyleCustom] = useState('')
  const [model, setModel] = useState(MODEL_OPTIONS[0].code)
  const [runMode, setRunMode] = useState<RunMode>('mock')
  const [ratio, setRatio] = useState('16:9')
  const [quality, setQuality] = useState('high')
  const [count] = useState(1)

  const [projectId, setProjectId] = useState<string>()
  const [promptText, setPromptText] = useState('')
  const [originalPromptText, setOriginalPromptText] = useState('')
  const [environmentFile, setEnvironmentFile] = useState<File | null>(null)
  const [environmentPreview, setEnvironmentPreview] = useState('')
  const [environmentAsset, setEnvironmentAsset] = useState<Asset | null>(null)
  const [originalJob, setOriginalJob] = useState<JobWithResponse | null>(null)
  const [composedJob, setComposedJob] = useState<JobWithResponse | null>(null)
  const [vectorAsset, setVectorAsset] = useState<Asset | null>(null)
  const [activeTab, setActiveTab] = useState<ActiveTab>('original')
  const [showSourceImage, setShowSourceImage] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [validating, setValidating] = useState(false)
  const [correcting, setCorrecting] = useState(false)
  const [correctionDraft, setCorrectionDraft] = useState<TextCorrection | null>(null)
  const [creditRules, setCreditRules] = useState<Record<string, number>>({})

  const visibleTexts = useMemo(
    () => requestedVisibleTexts(customerText, requiredTextInput),
    [customerText, requiredTextInput],
  )
  const storeName = useMemo(() => extractStoreName(customerText), [customerText])
  /** 材质 / 风格有效值：选「其他」时取自定义输入，否则取下拉值 */
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

  async function ensureCreditRules() {
    if (Object.keys(creditRules).length) return creditRules
    const rules = await creditApi.rules()
    setCreditRules(rules.data)
    return rules.data
  }

  async function uploadEnvironment(project: string): Promise<Asset | null> {
    if (environmentAsset) return environmentAsset
    if (!environmentFile) return null
    setUploading(true)
    try {
      const asset = await projectApi.uploadAsset(project, environmentFile)
      setEnvironmentAsset(asset.data)
      return asset.data
    } finally {
      setUploading(false)
    }
  }

  async function submitOriginal(
    project: string,
    prompt: string,
    mock: boolean,
    polishPrompt: string,
  ): Promise<JobWithResponse> {
    const response = await homeImageJobApi.create({
      projectId: project,
      prompt,
      count,
      ratio,
      model,
      requiredVisibleTexts: visibleTexts,
      mock,
      polishPrompt,
    })
    const finalJob = await imageJobApi.poll(response.data.jobId, 1600, mock ? 15_000 : 720_000)
    setOriginalJob(finalJob)
    return finalJob
  }

  async function submitComposition(project: string, envAsset: Asset, designAsset: Asset & { assetId?: string }) {
    const designAssetId = assetId(designAsset)
    if (!designAssetId) return null
    const response = await compositionJobApi.create({
      projectId: project,
      environmentAssetId: envAsset.id,
      designAssetId,
      outputFormat: 'png',
      requiredVisibleTexts: visibleTexts,
    })
    const finalJob = await imageJobApi.poll(response.data.jobId, 1600, 240_000)
    setComposedJob(finalJob)
    setActiveTab('composed')
    return finalJob
  }

  async function createVector(project: string, job?: JobWithResponse | null) {
    const response = await vectorAssetApi.create({
      projectId: project,
      jobId: job?.id,
      svg: createVectorSvg(storeName),
    })
    setVectorAsset(response.data.asset)
  }

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

    setBusy(true)
    setOriginalJob(null)
    setComposedJob(null)
    setVectorAsset(null)
    setCorrectionDraft(null)
    setShowSourceImage(false)
    setActiveTab(environmentFile || environmentAsset ? 'composed' : 'original')

    try {
      await ensureCreditRules()
      const selectedBusiness = BUSINESS_TYPES.find((item) => item.id === businessType)
      const briefResponse = await aiApi.brief({
        businessType,
        clientText: customerText,
        mock: runMode === 'mock',
        constraints: {
          material: materialValue,
          style: styleValue,
          ratio,
          quality,
          requiredVisibleTexts: visibleTexts.join('\n'),
        },
      })
      const generatedPrompt = briefResponse.data.imagePrompt
      setOriginalPromptText(generatedPrompt)
      setPromptText(generatedPrompt)

      const projectResponse = await projectApi.create({
        title: `${storeName} ${selectedBusiness?.title || '广告'}项目`,
        businessType,
        briefJson: {
          ...briefResponse.data.brief,
          customerText,
          material: materialValue,
          style: styleValue,
          ratio,
          quality,
          requiredVisibleTexts: visibleTexts,
          imagePrompt: generatedPrompt,
        },
      })
      const nextProjectId = projectResponse.data.id
      setProjectId(nextProjectId)

      const uploadedEnv = await uploadEnvironment(nextProjectId)
      const original = await submitOriginal(nextProjectId, generatedPrompt, runMode === 'mock', generatedPrompt)
      const designAsset = firstAsset(original)
      if (uploadedEnv && designAsset) {
        await submitComposition(nextProjectId, uploadedEnv, designAsset)
      } else {
        setActiveTab('original')
      }
      await createVector(nextProjectId, original)
      toast.success('工作台方案已生成')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '生成失败')
    } finally {
      setBusy(false)
    }
  }

  async function handleRegenerateWithPrompt() {
    if (!projectId || !promptText.trim()) {
      await handleGenerate()
      return
    }
    setBusy(true)
    setCorrectionDraft(null)
    setShowSourceImage(false)
    try {
      const original = await submitOriginal(projectId, promptText, runMode === 'mock', promptText)
      const designAsset = firstAsset(original)
      if (environmentAsset && designAsset) {
        await submitComposition(projectId, environmentAsset, designAsset)
      } else {
        setActiveTab('original')
      }
      await createVector(projectId, original)
      toast.success('已按当前提示词重新生成')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '重新生成失败')
    } finally {
      setBusy(false)
    }
  }

  /**
   * 重新生成 → 画布携带（契约见 Agent F4 / 编辑器 Agent 约定）：
   * 在首页首图生成完成后，跳转到 /editor/:projectId，
   * 通过 query 参数携带 (a) 生成图 URL 与 (b) AI 润色提示词，
   * 编辑器 Agent 用 useSearchParams 读取并自动回填提示词、要求标注后重新生图。
   * 形如：/editor/<projectId>?seedImg=<encodeURIComponent(url)>&polishPrompt=<encodeURIComponent(prompt)>
   */
  function getSeedImageUrl(): string | undefined {
    const asset = firstAsset(originalJob) || firstAsset(composedJob)
    return asset?.url
  }

  async function handleRegenerateToEditor() {
    // 尚未生成过任何图：先走正常生成流程，再由用户后续点击带图进入画布
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
  }

  async function handleValidateText() {
    if (!activeJob) return
    setValidating(true)
    try {
      const response = await imageJobApi.validateText(activeJob.id)
      const updated = response.data.job as JobWithResponse
      if (activeJob.jobType === 'composition') setComposedJob(updated)
      else setOriginalJob(updated)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '文字校验失败')
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
      if (activeJob.jobType === 'composition') setComposedJob(updated)
      else setOriginalJob(updated)
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
    toast.success('提示词已复制')
  }

  return (
    <div className="mx-auto w-full max-w-[1680px] px-5 py-6">
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(480px,38vw)]">
        <div className="min-w-0 space-y-4">
          <div>
            <h1 className="max-w-3xl text-[22px] font-extrabold leading-tight tracking-normal lg:text-[34px]">
              从客户一句需求，生成可交付的广告效果图
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              专为门头招牌、文化墙、灯箱、喷绘、菜单海报和品牌 VI 设计的 AI 生产系统。
            </p>
          </div>

          <div className="panel-card p-4">
            <label className="block">
              <span className="text-sm font-semibold text-text">客户需求</span>
              <textarea
                value={customerText}
                onChange={(event) => setCustomerText(event.target.value)}
                className="mt-2 min-h-[128px] w-full resize-y rounded-card border border-border bg-bg/70 p-3 text-sm leading-relaxed outline-none focus:border-blue/70"
              />
            </label>

            <label className="mt-3 block">
              <span className="text-sm font-semibold text-text">需原样显示的文字</span>
              <textarea
                value={requiredTextInput}
                onChange={(event) => setRequiredTextInput(event.target.value)}
                placeholder="每行一条，例如：不晚 STUDIO"
                className="mt-2 min-h-[72px] w-full resize-y rounded-card border border-border bg-bg/70 p-3 text-sm leading-relaxed outline-none focus:border-blue/70"
              />
            </label>

            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-card border border-border bg-bg/50 p-2">
              <button
                type="button"
                onClick={() => setRunMode('mock')}
                disabled={busy}
                className={cn('btn-secondary h-8', runMode === 'mock' && 'border-green/50 bg-green/15 text-text')}
              >
                联调预览
              </button>
              <button
                type="button"
                onClick={() => setRunMode('live')}
                disabled={busy}
                className={cn('btn-secondary h-8', runMode === 'live' && 'border-amber/50 bg-amber/15 text-amber')}
              >
                真实生图
              </button>
              <span className="text-xs text-muted">
                {runMode === 'mock' ? '生成本地预览图，不消耗 image2。' : `预计消耗约 ${estimate} 积分，以后端结算为准。`}
              </span>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-muted">业务</span>
                <select
                  value={businessType}
                  onChange={(event) => setBusinessType(event.target.value)}
                  disabled={busy}
                  className="h-10 w-full rounded-card border border-border bg-bg px-3 text-sm outline-none"
                >
                  {BUSINESS_TYPES.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </label>
              <SelectWithOther
                label="材质"
                options={MATERIAL_OPTIONS}
                value={material}
                customValue={materialCustom}
                onChange={setMaterial}
                onCustomChange={setMaterialCustom}
                disabled={busy}
              />
              <SelectWithOther
                label="风格"
                options={STYLE_OPTIONS}
                value={style}
                customValue={styleCustom}
                onChange={setStyle}
                onCustomChange={setStyleCustom}
                disabled={busy}
              />
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px]">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-muted">生图模型</span>
                <select
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  disabled={busy}
                  className="h-10 w-full rounded-card border border-border bg-bg px-3 text-sm outline-none"
                >
                  {MODEL_OPTIONS.map((item) => (
                    <option key={item.code} value={item.code} disabled={item.reserved}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[10px] text-muted">
                  {MODEL_OPTIONS.find((item) => item.code === model)?.reserved
                    ? '预留模型，暂未开放'
                    : '当前使用默认模型 gpt-image-2'}
                </span>
              </label>
              <button type="button" onClick={handleGenerate} disabled={busy} className="btn-primary mt-auto gap-2">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                生成方案
              </button>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div>
                <span className="mb-2 block text-xs font-semibold text-muted">输出尺寸</span>
                <PillToggle options={IMAGE_SIZE_PRESETS} value={ratio} onChange={setRatio} disabled={busy} />
              </div>
              <div>
                <span className="mb-2 block text-xs font-semibold text-muted">生成质量</span>
                <PillToggle options={IMAGE_QUALITY_OPTIONS} value={quality} onChange={setQuality} disabled={busy} />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
              {BUSINESS_TYPES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setBusinessType(item.id)}
                  className={cn(
                    'rounded-card border border-border bg-white/5 p-3 text-left transition hover:bg-white/10',
                    businessType === item.id && 'border-blue/70 bg-blue/15',
                  )}
                >
                  <strong className="block text-sm text-text">{item.title}</strong>
                  <span className="mt-1 block text-xs text-muted">{item.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {promptText ? (
            <section className="panel-card border-blue/30 bg-blue/[0.04] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">AI 润色提示词</h2>
                  <p className="mt-1 text-xs text-muted">可编辑后用于下一次生图。</p>
                </div>
                <span className="text-xs text-muted">{visibleTexts.join(' / ')}</span>
              </div>
              <textarea
                value={promptText}
                onChange={(event) => setPromptText(event.target.value)}
                className="mt-3 min-h-[150px] w-full resize-y rounded-card border border-border bg-bg/80 p-3 text-xs leading-relaxed outline-none focus:border-blue/70"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={handleCopyPrompt} className="btn-secondary gap-2">
                  <Copy className="h-4 w-4" />
                  复制提示词
                </button>
                <button type="button" onClick={() => setPromptText(originalPromptText)} className="btn-secondary gap-2">
                  <RotateCcw className="h-4 w-4" />
                  重置为 AI 原版
                </button>
                <button type="button" onClick={handleRegenerateWithPrompt} disabled={busy} className="btn-primary gap-2">
                  <Send className="h-4 w-4" />
                  用当前提示词生图
                </button>
              </div>
            </section>
          ) : null}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {[
              ['AE 需求整理', promptText ? '已生成标准 brief' : '把客户口述转成标准 brief'],
              ['策略判断', '行业、客群、风格与预算'],
              ['创意方向', '生成广告原图与环境图路径'],
              ['视觉生成', originalJob?.status || 'GPT-image-2 异步主图'],
              ['环境合成', composedJob?.status || (environmentFile ? '等待套入环境图' : '需先上传环境图')],
              ['工厂输出', vectorAsset ? 'SVG 已生成' : '矢量稿待生成'],
            ].map(([title, detail]) => (
              <div key={title} className="panel-card p-3">
                <Palette className="mb-3 h-4 w-4 text-blue" />
                <strong className="block text-sm">{title}</strong>
                <span className="mt-1 block text-xs text-muted">{detail}</span>
              </div>
            ))}
          </div>
        </div>

        <aside className="min-w-0 space-y-3">
          <div className="panel-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">上传客户环境图</h2>
                <p className="mt-1 text-xs text-muted">系统识别门头区域、透视和灯光，生成真实环境效果图。</p>
              </div>
              <label className="btn-secondary shrink-0 gap-2">
                <Upload className="h-4 w-4" />
                {uploading ? '上传中' : '选择图片'}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleUpload} />
              </label>
            </div>

            <div className="mt-4 overflow-hidden rounded-card border border-border bg-black/20">
              {busy ? (
                <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 text-muted">
                  <Loader2 className="h-10 w-10 animate-spin text-blue" />
                  <strong className="text-text">AI 设计方案生成中</strong>
                  <span className="text-xs">构图、材质、文字细节和环境合成正在处理</span>
                </div>
              ) : selectedImage ? (
                <img src={selectedImage} alt="生成结果" className="aspect-[4/3] w-full object-contain" />
              ) : (
                <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 text-muted">
                  <ImagePlus className="h-12 w-12" />
                  <span>等待生成效果图</span>
                </div>
              )}
              <div className="border-t border-border p-3">
                <strong className="block text-sm">{storeName} 门头项目</strong>
                <span className="text-xs text-muted">
                  {activeTab === 'vector'
                    ? vectorAsset
                      ? '矢量稿已生成'
                      : '矢量稿待生成'
                    : activeJob?.status === 'succeeded'
                      ? '结果已生成'
                      : environmentPreview
                        ? '环境图已选择'
                        : '等待广告原图生成'}
                </span>
              </div>
            </div>

            <div className="mt-3 inline-flex rounded-card border border-amber/40 bg-amber/10 px-2 py-1 text-xs text-amber">
              {runMode === 'live' ? '真实生图模式' : '联调预览模式'}
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <button
                type="button"
                className={cn('btn-secondary', activeTab === 'composed' && 'bg-blue/20 text-text')}
                onClick={() => setActiveTab('composed')}
              >
                真实环境图
              </button>
              <button
                type="button"
                className={cn('btn-secondary', activeTab === 'original' && 'bg-blue/20 text-text')}
                onClick={() => setActiveTab('original')}
              >
                广告原图
              </button>
              <button
                type="button"
                className={cn('btn-secondary', activeTab === 'vector' && 'bg-blue/20 text-text')}
                onClick={() => setActiveTab('vector')}
              >
                矢量图
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" disabled={!selectedImage} onClick={handleDownload} className="btn-secondary gap-2">
                <Download className="h-4 w-4" />
                下载当前图
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleRegenerateToEditor}
                title="携带生成图与 AI 润色提示词进入画布编辑器"
                className="btn-secondary gap-2"
              >
                <Send className="h-4 w-4" />
                重新生成（画布）
              </button>
            </div>
          </div>

          {activeJob && activeTab !== 'vector' ? (
            <section className="panel-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">文字校验与重绘</h2>
                  <p className="mt-1 text-xs text-muted">
                    {validation?.status === 'passed'
                      ? '已逐字通过 OCR 校验'
                      : validation?.status === 'needs_review'
                        ? '发现待复核文字'
                        : validation?.status === 'unavailable'
                          ? 'OCR 服务未就绪'
                          : '等待 OCR 校验'}
                  </p>
                </div>
                <div className="flex gap-2">
                  {activeJob.responseJson?.correctedAssets?.length ? (
                    <button type="button" onClick={() => setShowSourceImage((value) => !value)} className="btn-secondary h-8 gap-1.5">
                      {showSourceImage ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      {showSourceImage ? '校正图' : '原图'}
                    </button>
                  ) : null}
                  <button type="button" onClick={handleValidateText} disabled={validating} className="btn-secondary h-8 gap-1.5">
                    {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />}
                    {validation ? '重新校验' : '校验文字'}
                  </button>
                </div>
              </div>

              {validation?.error ? (
                <div className="mt-3 flex items-center gap-2 rounded-card border border-amber/30 bg-amber/10 p-2 text-xs text-amber">
                  <AlertTriangle className="h-4 w-4" />
                  {validation.error}
                </div>
              ) : null}

              <div className="mt-3 space-y-2">
                {checks.length ? (
                  checks.map((check) => (
                    <div
                      key={check.expectedText}
                      className={cn(
                        'rounded-card border p-3',
                        check.matched ? 'border-green/30 bg-green/10' : 'border-amber/30 bg-amber/10',
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <strong className="block text-sm">{check.expectedText}</strong>
                          <span className="mt-1 block text-xs text-muted">
                            {check.detectedText
                              ? `OCR：${check.detectedText}${check.confidence === undefined ? '' : ` · ${Math.round(check.confidence * 100)}%`}`
                              : '未检测到可确认文字'}
                          </span>
                        </div>
                        {check.matched ? (
                          <CheckCircle2 className="h-4 w-4 text-green" />
                        ) : (
                          <button
                            type="button"
                            className="btn-secondary h-8"
                            onClick={() => setCorrectionDraft(correctionFromCheck(check, validation))}
                          >
                            修正
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted">未设置需原样显示的文字。</p>
                )}
              </div>

              {correctionDraft ? (
                <div className="mt-3 rounded-card border border-border bg-bg/70 p-3">
                  <div className="mb-2 text-xs font-semibold text-muted">修正文字：{correctionDraft.expectedText}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {(['x', 'y', 'width', 'height', 'fontSize'] as const).map((key) => (
                      <label key={key} className="text-xs text-muted">
                        {key}
                        <input
                          type="number"
                          value={correctionDraft[key]}
                          onChange={(event) =>
                            setCorrectionDraft({ ...correctionDraft, [key]: Number(event.target.value) })
                          }
                          className="mt-1 h-8 w-full rounded-card border border-border bg-bg px-2 text-text outline-none"
                        />
                      </label>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={handleApplyCorrection} disabled={correcting} className="btn-primary gap-2">
                      {correcting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      生成校正图
                    </button>
                    <button type="button" onClick={() => setCorrectionDraft(null)} className="btn-secondary">
                      取消
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}
        </aside>
      </section>
    </div>
  )
}
