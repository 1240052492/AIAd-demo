import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Sparkles, ArrowRight } from 'lucide-react'
import { BUSINESS_TYPES } from '@/types'
import { cn } from '@/utils/cn'
import { useAuthStore } from '@/stores'
import { projectApi, aiApi, imageJobApi } from '@/services/api'
import BusinessTypeSelect from '@/components/home/BusinessTypeSelect'
import QuickBusinessCards from '@/components/home/QuickBusinessCards'
import WorkflowSteps from '@/components/home/WorkflowSteps'
import EnvironmentUpload from '@/components/home/EnvironmentUpload'

/** 单选 pill 组（用于模型 / 比例 / 数量） */
function PillToggle<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn('pill-tag', active && 'active')}
            aria-pressed={active}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

const MODEL_OPTIONS = [
  { label: 'Anthropic', value: 'anthropic' as const },
  { label: 'GPT-image-2', value: 'gpt-image-2' as const },
]
const RATIO_OPTIONS = [
  { label: '9:16', value: '9:16' as const },
  { label: '16:9', value: '16:9' as const },
  { label: '1:1', value: '1:1' as const },
]
const COUNT_OPTIONS = [
  { label: '3 张方案', value: 3 as const },
  { label: '1 张方案', value: 1 as const },
]

/** 材质结构化选项（门头/招牌/文化墙常见工艺） */
const MATERIAL_OPTIONS = [
  { label: '亚克力发光字', value: '亚克力发光字' },
  { label: '不锈钢/钛金字', value: '不锈钢钛金字' },
  { label: 'LED 灯箱', value: 'LED灯箱' },
  { label: '树脂字', value: '树脂字' },
  { label: '金属烤漆字', value: '金属烤漆字' },
  { label: '镂空冲孔字', value: '镂空冲孔字' },
]
/** 风格结构化选项 */
const STYLE_OPTIONS = [
  { label: '现代简约', value: '现代简约' },
  { label: '轻奢', value: '轻奢' },
  { label: '复古', value: '复古' },
  { label: '国潮', value: '国潮' },
  { label: '极简', value: '极简' },
  { label: '科技感', value: '科技感' },
]

const EXAMPLE_BRIEF =
  '给一家服装工作室设计门头，主色想要低饱和的雾霾蓝，风格干净现代、带一点轻奢感，灯箱发光字。店铺在商场一层，门宽约 4 米，希望路过的客人一眼能记住品牌。'

export default function HomePage() {
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)

  const [briefText, setBriefText] = useState<string>(EXAMPLE_BRIEF)
  const [businessType, setBusinessType] = useState<string>('storefront_sign')
  const [model, setModel] = useState<'anthropic' | 'gpt-image-2'>('gpt-image-2')
  const [ratio, setRatio] = useState<'9:16' | '16:9' | '1:1'>('9:16')
  const [count, setCount] = useState<number>(3)
  const [material, setMaterial] = useState<string>('')
  const [style, setStyle] = useState<string>('')
  const [generating, setGenerating] = useState<boolean>(false)

  const selectedBt = BUSINESS_TYPES.find((b) => b.key === businessType)
  const projectTitle = `${selectedBt?.label ?? '广告'}生成方案`
  const [projectStatus, setProjectStatus] = useState<string>('待生成 · 填写需求后点击「生成方案」')

  const handleGenerate = async () => {
    if (!briefText.trim()) {
      toast.error('请先填写客户需求')
      return
    }
    if (!token) {
      toast.error('请先登录后再生成')
      navigate('/login')
      return
    }

    setGenerating(true)
    setProjectStatus('生成中 · AI 正在整理需求并生成方案…')
    try {
      // 1) AI 整理 brief（顶层携带 missingQuestions / productionNotes / riskWarnings / imagePrompt）
      const constraints: Record<string, string> = {
        ratio,
        model,
        count: String(count),
      }
      if (material) constraints.material = material
      if (style) constraints.style = style
      const briefRes = await aiApi.brief({
        businessType,
        clientText: briefText,
        constraints,
      })
      const { brief, imagePrompt, missingQuestions, productionNotes, riskWarnings } = briefRes.data

      // 2) 创建项目，briefJson 携带完整结构化结果，供编辑器与后续步骤复用
      const projectRes = await projectApi.create({
        title: projectTitle,
        businessType,
        briefJson: {
          ...brief,
          missingQuestions,
          productionNotes,
          riskWarnings,
          imagePrompt,
        } as object,
      })
      const project = projectRes.data

      // 3) 提交生图任务：用 brief 给出的 imagePrompt，写入同一项目，便于编辑器回填
      let jobId: string | undefined
      try {
        if (imagePrompt && imagePrompt.trim()) {
          const jobRes = await imageJobApi.create({
            projectId: project.id,
            prompt: imagePrompt,
            count,
            ratio,
          })
          jobId = jobRes.data.jobId
        }
      } catch (jobErr) {
        // 生图任务提交失败（如积分不足）不阻断进入编辑器，仅提示
        const msg = jobErr instanceof Error ? jobErr.message : '生图任务提交失败'
        toast.info(`方案已生成，但生图任务提交失败：${msg}`)
      }

      toast.success('方案已生成，正在进入画布…')
      setProjectStatus(
        jobId
          ? '已创建 · 生图任务已提交，进入画布查看进度'
          : '已创建 · 进入画布继续编辑与导出',
      )
      // 通过导航 state 把 jobId 带给编辑器，由其轮询任务并回填生成的素材
      navigate(`/editor/${project.id}`, { state: { jobId } })
    } catch (e) {
      const msg = e instanceof Error ? e.message : '生成失败，请稍后重试'
      toast.error(msg)
      setProjectStatus(`失败 · ${msg}`)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 py-8">
      {/* ===== Hero 区域 ===== */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 左栏 */}
        <div className="flex flex-col gap-5">
          <div>
            <h1 className="text-3xl font-bold leading-tight tracking-tight lg:text-[34px]">
              从客户一句需求，
              <br />
              生成<span className="bg-gradient-to-r from-blue to-[#7cc7ff] bg-clip-text text-transparent">可交付</span>的广告效果图
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              专为门头招牌、文化墙、灯箱、喷绘、菜单海报和品牌 VI 设计的 AI 生产系统。
            </p>
          </div>

          {/* 需求输入 + 控制行 卡片 */}
          <div className="panel-card flex flex-col gap-4 p-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-text">客户需求</label>
              <textarea
                value={briefText}
                onChange={(e) => setBriefText(e.target.value)}
                rows={5}
                placeholder="描述客户的行业、风格、材质、尺寸、预算等…"
                className="w-full resize-none rounded-card border border-border bg-bg/60 px-3 py-2.5 text-sm leading-relaxed text-text placeholder:text-muted/60 outline-none transition-colors focus:border-blue/60"
              />
            </div>

            {/* 控制行 */}
            <div className="flex flex-col gap-3 border-t border-border pt-4">
              <BusinessTypeSelect value={businessType} onChange={setBusinessType} />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <PillToggle options={MODEL_OPTIONS} value={model} onChange={setModel} />
                <PillToggle options={RATIO_OPTIONS} value={ratio} onChange={setRatio} />
                <PillToggle options={COUNT_OPTIONS} value={count} onChange={setCount} />
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted">材质工艺</span>
                  <PillToggle options={MATERIAL_OPTIONS} value={material} onChange={setMaterial} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted">设计风格</span>
                  <PillToggle options={STYLE_OPTIONS} value={style} onChange={setStyle} />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={generating}
                  className={cn('btn-primary gap-1.5', generating && 'cursor-not-allowed opacity-70')}
                >
                  {generating ? (
                    '生成中…'
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      生成方案
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* 快捷业务卡片 */}
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-muted">快捷业务</h2>
            <QuickBusinessCards selected={businessType} onSelect={setBusinessType} />
          </div>
        </div>

        {/* 右栏：环境图上传 */}
        <div className="flex flex-col gap-4">
          <div className="panel-card flex flex-col gap-3 p-4">
            <div>
              <h2 className="text-base font-semibold text-text">上传客户环境图</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                上传门店、墙面或展位的实拍照片，AI 会把生成的效果图合成到真实环境中，预览更直观。
              </p>
            </div>

            <EnvironmentUpload />

            {/* 项目信息 */}
            <div className="flex items-center justify-between rounded-card border border-border bg-bg/40 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text">{projectTitle}</p>
                <p className="mt-0.5 truncate text-xs text-muted">{projectStatus}</p>
              </div>
              <span className="credit-badge shrink-0">
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </div>

          {/* 提示卡 */}
          <div className="panel-card flex items-start gap-3 p-4 text-xs leading-relaxed text-muted">
            <span className="mt-0.5 text-base">💡</span>
            <p>
              提示：需求描述越具体（行业、客群、风格、材质、尺寸、预算），生成的效果图越贴近交付标准。
              可先点选上方业务类型，再补全细节。
            </p>
          </div>
        </div>
      </section>

      {/* ===== 工作流步骤条 ===== */}
      <section className="mt-10 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-text">AI 生产流程</h2>
          <span className="text-xs text-muted">从需求到工厂输出，全链路自动化</span>
        </div>
        <WorkflowSteps currentStep={0} />
      </section>
    </div>
  )
}
