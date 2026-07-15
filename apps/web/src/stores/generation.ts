import { create } from 'zustand'
import type { Asset, GenerationJob, TextCorrection, TextValidationCheck, TextValidationRecord } from '@/types'
import { aiApi, compositionJobApi, imageJobApi, projectApi, vectorAssetApi } from '@/services/api'
import { homeImageJobApi } from '@/services/home.api'
import { createVectorSvg, extractStoreName } from '@/pages/Home/workbench.utils'
import { BUSINESS_TYPES } from '@/pages/Home/workbench.constants'
import { toast } from 'sonner'
import { syncCreditBalance } from '@/stores'

export type ActiveTab = 'composed' | 'original' | 'vector'
export type JobWithResponse = GenerationJob & {
  errorMessage?: string
  results?: Array<Asset & { assetId?: string }>
  responseJson?: {
    textValidation?: TextValidationRecord
    textCorrections?: TextCorrection[]
    correctedAssets?: Asset[]
    assetId?: string
    url?: string
  }
}

/** 取生图最终展示资产：优先校正后的资产，否则取首个结果资产 */
export function firstAsset(job?: JobWithResponse | null): Asset | undefined {
  const corrected = job?.responseJson?.correctedAssets
  return (corrected?.length ? corrected[corrected.length - 1] : undefined) || job?.results?.[0]
}

/** 取生图原始资产（用于「原图 / 校正图」切换） */
export function sourceAsset(job?: JobWithResponse | null): Asset | undefined {
  return job?.results?.[0]
}

export function assetId(asset?: Asset & { assetId?: string }): string | undefined {
  return asset?.id || asset?.assetId
}

export function textValidation(job?: JobWithResponse | null): TextValidationRecord | undefined {
  return job?.responseJson?.textValidation
}

export function correctionFromCheck(check: TextValidationCheck, validation?: TextValidationRecord): TextCorrection {
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

interface GenerateConfig {
  businessType: string
  customerText: string
  materialValue: string
  styleValue: string
  ratio: string
  quality: string
  visibleTexts: string[]
  count: number
  model: string
  mock: boolean
  environmentFile?: File | null
  environmentAsset?: Asset | null
}

interface RegenerateConfig {
  projectId: string
  promptText: string
  mock: boolean
  environmentAsset?: Asset | null
  visibleTexts: string[]
}

interface GenerationState {
  /** 是否正在生成（跨路由保留，保证切页不中断） */
  busy: boolean
  projectId?: string
  promptText: string
  originalPromptText: string
  activeTab: ActiveTab
  originalJob: JobWithResponse | null
  composedJob: JobWithResponse | null
  vectorAsset: Asset | null
  environmentAsset: Asset | null
  showSourceImage: boolean
  correctionDraft: TextCorrection | null
  /** 最近一次生成携带的元信息，供「用当前提示词重新生成」复用参数 */
  storeName: string
  ratio: string
  model: string
  error?: string
  /** 最近一次完整 generate 参数，供失败重试 */
  lastGenerateConfig?: GenerateConfig | null

  /** 完整生图流程：在 store action 中执行，组件卸载不影响轮询 */
  generate: (config: GenerateConfig) => Promise<void>
  /** 用当前提示词重新生成 */
  regenerateWithPrompt: (config: RegenerateConfig) => Promise<void>
  /** 用 lastGenerateConfig 重试完整流程 */
  retryLast: () => Promise<void>
  clearError: () => void
  setActiveTab: (tab: ActiveTab) => void
  setPromptText: (value: string) => void
  setOriginalPromptText: (value: string) => void
  setShowSourceImage: (value: boolean) => void
  setCorrectionDraft: (value: TextCorrection | null) => void
  setEnvironmentAsset: (value: Asset | null) => void
  updateOriginalJob: (job: JobWithResponse) => void
  updateComposedJob: (job: JobWithResponse) => void
  setVectorAsset: (value: Asset | null) => void
  reset: () => void
}

export const useGenerationStore = create<GenerationState>()((set, get) => {
  async function submitOriginal(
    project: string,
    prompt: string,
    mock: boolean,
    polishPrompt: string,
    opts: { count: number; ratio: string; model: string; visibleTexts: string[] },
  ): Promise<JobWithResponse> {
    const response = await homeImageJobApi.create({
      projectId: project,
      prompt,
      count: opts.count,
      ratio: opts.ratio,
      model: opts.model,
      requiredVisibleTexts: opts.visibleTexts,
      mock,
      polishPrompt,
    })
    const finalJob = (await imageJobApi.poll(response.data.jobId, 1600, mock ? 15_000 : 720_000)) as JobWithResponse
    set({ originalJob: finalJob })
    await syncCreditBalance().catch(() => undefined)
    if (finalJob.status !== 'succeeded') {
      throw new Error(finalJob.errorMessage || '图片生成失败')
    }
    return finalJob
  }

  async function submitComposition(
    project: string,
    envAsset: Asset,
    designAsset: Asset & { assetId?: string },
    visibleTexts: string[],
  ): Promise<JobWithResponse | null> {
    const designAssetId = assetId(designAsset)
    if (!designAssetId) return null
    const response = await compositionJobApi.create({
      projectId: project,
      environmentAssetId: envAsset.id,
      designAssetId,
      outputFormat: 'png',
      requiredVisibleTexts: visibleTexts,
    })
    const finalJob = (await imageJobApi.poll(response.data.jobId, 1600, 240_000)) as JobWithResponse
    set({ composedJob: finalJob })
    await syncCreditBalance().catch(() => undefined)
    if (finalJob.status !== 'succeeded') {
      throw new Error(finalJob.errorMessage || '环境合成失败')
    }
    set({ activeTab: 'composed' })
    return finalJob
  }

  async function createVector(project: string, job?: JobWithResponse | null) {
    const response = await vectorAssetApi.create({
      projectId: project,
      jobId: job?.id,
      svg: createVectorSvg(get().storeName),
    })
    set({ vectorAsset: response.data.asset })
    await syncCreditBalance().catch(() => undefined)
  }

  async function createOptionalOutputs(
    project: string,
    original: JobWithResponse,
    environment: Asset | null | undefined,
    visibleTexts: string[],
  ): Promise<boolean> {
    let partial = false
    const designAsset = firstAsset(original)
    if (environment && designAsset) {
      try {
        await submitComposition(project, environment, designAsset, visibleTexts)
      } catch (err) {
        partial = true
        set({ activeTab: 'original' })
        toast.warning(`效果图已生成，但环境合成失败：${err instanceof Error ? err.message : '未知错误'}`)
      }
    } else {
      set({ activeTab: 'original' })
    }
    try {
      await createVector(project, original)
    } catch (err) {
      partial = true
      await syncCreditBalance().catch(() => undefined)
      toast.warning(`效果图已保留，但矢量导出失败：${err instanceof Error ? err.message : '未知错误'}`)
    }
    return partial
  }

  return {
    busy: false,
    projectId: undefined,
    promptText: '',
    originalPromptText: '',
    activeTab: 'original',
    originalJob: null,
    composedJob: null,
    vectorAsset: null,
    environmentAsset: null,
    showSourceImage: false,
    correctionDraft: null,
    storeName: '',
    ratio: '16:9',
    model: '',
    error: undefined,
    lastGenerateConfig: null,

    generate: async (config) => {
      set({
        busy: true,
        error: undefined,
        lastGenerateConfig: config,
        projectId: undefined,
        promptText: '',
        originalPromptText: '',
        originalJob: null,
        composedJob: null,
        vectorAsset: null,
        showSourceImage: false,
        correctionDraft: null,
        environmentAsset: config.environmentAsset ?? null,
        storeName: extractStoreName(config.customerText),
        ratio: config.ratio,
        model: config.model,
        activeTab: config.environmentFile || config.environmentAsset ? 'composed' : 'original',
      })
      try {
        const selectedBusiness = BUSINESS_TYPES.find((item) => item.id === config.businessType)
        const storeName = get().storeName
        const briefResponse = await aiApi.brief({
          businessType: config.businessType,
          clientText: config.customerText,
          mock: config.mock,
          constraints: {
            material: config.materialValue,
            style: config.styleValue,
            ratio: config.ratio,
            quality: config.quality,
            requiredVisibleTexts: config.visibleTexts.join('\n'),
          },
        })
        const generatedPrompt = briefResponse.data.imagePrompt
        set({ originalPromptText: generatedPrompt, promptText: generatedPrompt })

        const projectResponse = await projectApi.create({
          title: `${storeName} ${selectedBusiness?.title || '广告'}项目`,
          businessType: config.businessType,
          briefJson: {
            ...briefResponse.data.brief,
            customerText: config.customerText,
            material: config.materialValue,
            style: config.styleValue,
            ratio: config.ratio,
            quality: config.quality,
            requiredVisibleTexts: config.visibleTexts,
            imagePrompt: generatedPrompt,
          },
        })
        const nextProjectId = projectResponse.data.id
        set({ projectId: nextProjectId })

        let uploadedEnv: Asset | null = config.environmentAsset ?? null
        const envFile = config.environmentFile
        if (!uploadedEnv && envFile) {
          const asset = await projectApi.uploadAsset(nextProjectId, envFile)
          uploadedEnv = asset.data
          set({ environmentAsset: uploadedEnv })
        }

        const original = await submitOriginal(nextProjectId, generatedPrompt, config.mock, generatedPrompt, {
          count: config.count,
          ratio: config.ratio,
          model: config.model,
          visibleTexts: config.visibleTexts,
        })
        const partial = await createOptionalOutputs(nextProjectId, original, uploadedEnv, config.visibleTexts)
        set({ error: undefined })
        toast.success(partial ? '效果图已生成，部分附加结果未完成' : '设计方案已生成')
      } catch (err) {
        const message = err instanceof Error ? err.message : '生成失败'
        const failedJob = get().originalJob
        set({
          error: failedJob?.errorMessage || message,
        })
        toast.error(failedJob?.errorMessage || message)
      } finally {
        await syncCreditBalance().catch(() => undefined)
        set({ busy: false })
      }
    },

    regenerateWithPrompt: async (config) => {
      set({ busy: true, correctionDraft: null, showSourceImage: false, error: undefined })
      try {
        const original = await submitOriginal(config.projectId, config.promptText, config.mock, config.promptText, {
          count: 1,
          ratio: get().ratio,
          model: get().model,
          visibleTexts: config.visibleTexts,
        })
        const partial = await createOptionalOutputs(
          config.projectId,
          original,
          config.environmentAsset,
          config.visibleTexts,
        )
        set({ error: undefined })
        toast.success(partial ? '效果图已重新生成，部分附加结果未完成' : '已按当前描述重新生成')
      } catch (err) {
        const message = err instanceof Error ? err.message : '重新生成失败'
        const failedJob = get().originalJob
        set({ error: failedJob?.errorMessage || message })
        toast.error(failedJob?.errorMessage || message)
      } finally {
        await syncCreditBalance().catch(() => undefined)
        set({ busy: false })
      }
    },

    retryLast: async () => {
      const config = get().lastGenerateConfig
      if (!config) {
        toast.error('没有可重试的生成参数，请重新填写需求后生成')
        return
      }
      // File 对象在内存中仍可复用；若环境图仅有 Asset 则用 Asset
      await get().generate(config)
    },

    clearError: () => set({ error: undefined }),
    setActiveTab: (tab) => set({ activeTab: tab }),
    setPromptText: (value) => set({ promptText: value }),
    setOriginalPromptText: (value) => set({ originalPromptText: value }),
    setShowSourceImage: (value) => set({ showSourceImage: value }),
    setCorrectionDraft: (value) => set({ correctionDraft: value }),
    setEnvironmentAsset: (value) => set({ environmentAsset: value }),
    updateOriginalJob: (job) => set({ originalJob: job }),
    updateComposedJob: (job) => set({ composedJob: job }),
    setVectorAsset: (value) => set({ vectorAsset: value }),
    reset: () =>
      set({
        busy: false,
        projectId: undefined,
        promptText: '',
        originalPromptText: '',
        activeTab: 'original',
        originalJob: null,
        composedJob: null,
        vectorAsset: null,
        environmentAsset: null,
        showSourceImage: false,
        correctionDraft: null,
        error: undefined,
        lastGenerateConfig: null,
      }),
  }
})
