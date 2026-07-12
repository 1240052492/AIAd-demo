import { prisma } from '../../config'
import { imageQueue, compositionQueue } from '../../config'
import { AnthropicService } from './anthropic.service'
import { PromptService } from './prompt.service'

/**
 * 6 个岗位的系统提示词模板（内置 Agency Workflow Skills 方法论）。
 * 键名与 WorkflowStepDef.roleKey 对应。
 */
export const ROLE_PROMPTS: Record<string, string> = {
  account_executive: `你扮演广告公司 AE（客户执行）。负责把客户零散需求整理为标准 Brief。
方法论：
- 收集十要素：品牌、产品/服务、项目背景、问题、商业目标、传播目标、目标人群、渠道、交付物、限制。
- 区分「已确认事实 / 合理推断 / 待确认问题」，缺失信息必须列出追问清单。
- 输出 JSON：{ "brief": { "targetAudience", "visualDirection", "missingQuestions":[], "storeName"?,"industry"?,"style"? }, "imagePrompt": "英文生图提示词" }。
仅返回 JSON，不要解释。`,

  strategy_director: `你扮演策略总监（Strategy Director）。负责诊断真正的问题并产出 Creative Brief。
方法论：
- 诊断客户表面需求背后的真问题（Why now / 商业张力）。
- 提炼品牌定位与消费者洞察（insight），用一句话说清「我们到底要改变什么」。
- 给出传播目标、核心信息屋（message house）与竞品区隔框架。
- 输出 JSON：{ "problemDiagnosis", "consumerInsight", "brandPositioning", "communicationObjective", "keyMessage", "competitiveAngle" }。
仅返回 JSON。`,

  creative_director: `你扮演创意总监（Creative Director）。负责发散创意路线并推荐 Big Idea。
方法论：
- 基于策略输出 3 条创意路线（routeA/B/C），每条含概念名、核心 idea、执行方向。
- 用「52 创意透镜 / 81 矩阵」思路评审，给出 Big Idea 推荐与理由。
- 给出卖稿逻辑（为何这条最能打动目标人群）。
- 输出 JSON：{ "routes":[{ "name","idea","execution" }], "recommendedBigIdea", "rationale", "sellLogic" }。
仅返回 JSON。`,

  copywriter: `你扮演文案（Copywriter）。负责把创意落地为文字资产。
方法论：
- 基于上游 Big Idea 产出 Campaign slogan、KV headline、2-3 条社媒文案、一段 Brand manifesto。
- 语气贴合品牌与业务类型（门头/文化墙等）。
- 输出 JSON：{ "slogan", "kvHeadline", "socialPosts":[], "brandManifesto" }。
仅返回 JSON。`,

  designer: `你扮演设计师（Designer）。负责把创意转为视觉与生图提示词。
方法论：
- 给出 Visual Direction 与 Key Visual 描述。
- 产出 1-4 条英文生图提示词变体（中译英优化，含材质/光线/镜头/渲染词）。
- 给出 Moodboard 关键词。
- 输出 JSON：{ "visualDirection", "keyVisual", "imagePrompts":[], "moodboardKeywords":[] }。
仅返回 JSON。`,

  boss: `你是广告公司 BOSS，统筹全流程并做最终质量复核。
方法论：
- 通读 AE / 策略 / 创意 / 文案 / 设计各步产出，做一致性复核。
- 指出风险点、需客户确认项、提案结构（提案 PPT 大纲）。
- 给出最终交付建议（生图、合成、导出顺序）。
- 输出 JSON：{ "qualityCheck":[], "risks":[], "clientConfirmItems":[], "proposalOutline":[], "deliveryPlan" }。
仅返回 JSON。`,
}

/**
 * 工作流步骤定义
 */
interface WorkflowStepDef {
  role: 'ae' | 'strategy' | 'creative' | 'visual' | 'compose' | 'output'
  name: string
  roleKey: keyof typeof ROLE_PROMPTS
  /** 是否为异步步骤（生图 / 合成），需等待 BullMQ 任务 */
  async?: boolean
  /** 是否需要用户确认 / 补充输入 */
  requireConfirm?: boolean
  /** 该步骤消耗的文本 AI 积分（异步步骤不在此计费，由 Worker 单独冻结） */
  creditCost?: number
}

const STEP_DEFS: WorkflowStepDef[] = [
  { role: 'ae', name: 'AE 需求整理', roleKey: 'account_executive', creditCost: 1 },
  { role: 'strategy', name: '策略判断', roleKey: 'strategy_director', creditCost: 1 },
  { role: 'creative', name: '创意方向', roleKey: 'creative_director', creditCost: 1 },
  { role: 'visual', name: '视觉生成', roleKey: 'designer', async: true },
  { role: 'compose', name: '环境合成', roleKey: 'designer', async: true, requireConfirm: true },
  { role: 'output', name: '工厂输出', roleKey: 'boss', creditCost: 1 },
]

/**
 * 单步执行结果
 */
export interface WorkflowStepResult {
  index: number
  role: WorkflowStepDef['role']
  name: string
  status: 'done' | 'pending' | 'failed' | 'awaiting_input'
  content?: unknown
  /** 关联的异步任务 ID（GenerationJob.id） */
  jobId?: string
  requireConfirm?: boolean
  creditCost?: number
  error?: string
  createdAt: string
}

/**
 * 工作流执行上下文（跨步骤传递中间产物，支持断点续跑）
 */
export interface WorkflowContext {
  userId: string
  projectId: string
  userInput: string
  brief?: Record<string, unknown>
  strategy?: Record<string, unknown>
  creative?: Record<string, unknown>
  prompts?: string[]
  steps: WorkflowStepResult[]
}

/**
 * Agency Workflow Skills 引擎：把 6 个岗位的方法论串成完整流程。
 * 支持断点续跑——每一步结果持久化到 Project.briefJson.agencyWorkflow，
 * 重新进入时跳过已完成 / 已提交的步骤。
 */
export class WorkflowEngine {
  private anthropicService: AnthropicService
  private promptService: PromptService

  constructor(anthropicService?: AnthropicService) {
    this.anthropicService = anthropicService ?? new AnthropicService()
    this.promptService = new PromptService(this.anthropicService)
  }

  /**
   * 执行完整工作流（兼容断点续跑）。
   * @param projectId 项目 ID（作为流程上下文与产物归属）
   * @param userInput 客户原始需求文本；断点续跑时若为空则复用已保存输入
   * @returns 各步骤结果数组
   */
  async runFullWorkflow(projectId: string, userInput: string): Promise<WorkflowStepResult[]> {
    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) throw new Error('项目不存在')

    const saved = this.readState(project.briefJson)
    const input = userInput && userInput.trim() ? userInput : saved.input || project.title || ''
    if (!input) throw new Error('缺少工作流输入（客户原始需求）')

    const steps: WorkflowStepResult[] = saved.steps ? [...saved.steps] : []

    // 恢复中间产物
    const ctx: WorkflowContext = {
      userId: project.userId,
      projectId,
      userInput: input,
      brief: saved.brief,
      strategy: saved.strategy,
      creative: saved.creative,
      prompts: saved.prompts,
      steps,
    }

    for (let i = 0; i < STEP_DEFS.length; i++) {
      const prev = steps[i]
      // 断点续跑：已完成或已提交异步任务的步骤直接跳过
      if (prev && (prev.status === 'done' || prev.status === 'pending')) {
        this.restoreFromStep(prev, ctx)
        continue
      }
      const result = await this.executeStep(i, ctx)
      steps[i] = result
      // 持久化当前进度（含 currentStep 用于续跑）
      await this.writeState(projectId, {
        input,
        currentStep: i + 1,
        steps,
        brief: ctx.brief,
        strategy: ctx.strategy,
        creative: ctx.creative,
        prompts: ctx.prompts,
      })
      if (result.status === 'failed') break
    }

    return steps
  }

  /**
   * 执行单个步骤（供断点续跑 / 单步重试调用）。
   * @param stepIndex 步骤下标 0-5
   * @param ctx 工作流上下文（会被就地更新）
   */
  async executeStep(stepIndex: number, ctx: WorkflowContext): Promise<WorkflowStepResult> {
    const def = STEP_DEFS[stepIndex]
    const base = (): WorkflowStepResult => ({
      index: stepIndex,
      role: def.role,
      name: def.name,
      status: 'pending',
      requireConfirm: def.requireConfirm,
      creditCost: def.creditCost,
      createdAt: new Date().toISOString(),
    })

    try {
      switch (def.role) {
        case 'ae': {
          const brief = await this.anthropicService.generateBrief({
            businessType: (ctx as any).businessType || 'storefront_sign',
            clientText: ctx.userInput,
          })
          ctx.brief = brief.brief as unknown as Record<string, unknown>
          // AE 阶段把精简 brief 写入项目，方便后续读取
          const result = base()
          result.content = { brief: brief.brief, imagePrompt: brief.imagePrompt }
          result.status = 'done'
          return result
        }

        case 'strategy': {
          const text = await this.anthropicService.complete({
            system: ROLE_PROMPTS.strategy_director,
            user: `【客户输入】${ctx.userInput}\n【AE Brief】${JSON.stringify(ctx.brief ?? {})}`,
            maxTokens: 1500,
          })
          const strategy = parseJsonObject(text)
          ctx.strategy = strategy
          const result = base()
          result.content = strategy
          result.status = 'done'
          return result
        }

        case 'creative': {
          const text = await this.anthropicService.complete({
            system: ROLE_PROMPTS.creative_director,
            user: `【策略】${JSON.stringify(ctx.strategy ?? {})}\n【Brief】${JSON.stringify(ctx.brief ?? {})}`,
            maxTokens: 1800,
          })
          const creative = parseJsonObject(text)
          ctx.creative = creative
          const result = base()
          result.content = creative
          result.status = 'done'
          return result
        }

        case 'visual': {
          // 设计师阶段：基于 Brief + 创意产出多风格提示词，并异步提交生图任务
          const designText = await this.anthropicService.complete({
            system: ROLE_PROMPTS.designer,
            user: `【Brief】${JSON.stringify(ctx.brief ?? {})}\n【创意】${JSON.stringify(ctx.creative ?? {})}`,
            maxTokens: 1800,
          })
          const designJson = parseJsonObject(designText)
          const prompts: string[] =
            (designJson.imagePrompts as string[]) ||
            (await this.promptService.optimizePrompt({ ...ctx.brief, ...ctx.creative })).prompts
          ctx.prompts = prompts

          if (prompts.length === 0) {
            const r = base()
            r.status = 'failed'
            r.error = '未产出有效生图提示词'
            return r
          }

          // 提交生图任务到 BullMQ（首条提示词，count=1）
          const genJob = await prisma.generationJob.create({
            data: {
              userId: ctx.userId,
              projectId: ctx.projectId,
              provider: 'openai',
              model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
              jobType: 'image_generation',
              status: 'queued',
              prompt: prompts[0],
              requestJson: { prompts, count: 1, ratio: '1:1' },
              creditsFrozen: 2,
            },
          })
          await imageQueue.add('generate', {
            jobId: genJob.id,
            userId: ctx.userId,
            projectId: ctx.projectId,
            prompt: prompts[0],
            count: 1,
            model: genJob.model,
            ratio: '1:1',
            size: '1024x1024',
            creditsFrozen: 2,
          })

          const result = base()
          result.content = { prompts, submittedPrompt: prompts[0] }
          result.jobId = genJob.id
          result.status = 'pending'
          return result
        }

        case 'compose': {
          // 环境合成：需要环境图 + 已生成的设计图
          const designAsset = await prisma.asset.findFirst({
            where: { projectId: ctx.projectId, type: 'generated_design' },
            orderBy: { createdAt: 'desc' },
          })
          const envAsset = await prisma.asset.findFirst({
            where: { projectId: ctx.projectId, type: 'upload_environment' },
            orderBy: { createdAt: 'desc' },
          })
          const missing: string[] = []
          if (!designAsset) missing.push('尚未生成设计图（请等待视觉生成步骤完成）')
          if (!envAsset) missing.push('缺少真实环境照片（请先上传环境图）')

          if (missing.length > 0) {
            const r = base()
            r.status = 'awaiting_input'
            r.content = { missing }
            return r
          }

          const compJob = await prisma.generationJob.create({
            data: {
              userId: ctx.userId,
              projectId: ctx.projectId,
              provider: 'sharp',
              model: 'composition-v1',
              jobType: 'composition',
              status: 'queued',
              requestJson: {
                environmentAssetId: envAsset!.id,
                designAssetId: designAsset!.id,
                outputFormat: 'png',
              },
              creditsFrozen: 1,
            },
          })
          await compositionQueue.add('compose', {
            jobId: compJob.id,
            userId: ctx.userId,
            projectId: ctx.projectId,
            environmentAssetId: envAsset!.id,
            designAssetId: designAsset!.id,
            position: undefined,
            outputFormat: 'png',
            creditsFrozen: 1,
          })
          const result = base()
          result.content = { environmentAssetId: envAsset!.id, designAssetId: designAsset!.id }
          result.jobId = compJob.id
          result.status = 'pending'
          return result
        }

        case 'output': {
          const text = await this.anthropicService.complete({
            system: ROLE_PROMPTS.boss,
            user:
              `【AE】${JSON.stringify(ctx.brief ?? {})}\n` +
              `【策略】${JSON.stringify(ctx.strategy ?? {})}\n` +
              `【创意】${JSON.stringify(ctx.creative ?? {})}\n` +
              `【生图提示词】${JSON.stringify(ctx.prompts ?? [])}`,
            maxTokens: 1500,
          })
          const boss = parseJsonObject(text)
          const result = base()
          result.content = boss
          result.status = 'done'
          return result
        }

        default: {
          const r = base()
          r.status = 'failed'
          r.error = '未知的工作流步骤'
          return r
        }
      }
    } catch (err) {
      const r = base()
      r.status = 'failed'
      r.error = err instanceof Error ? err.message : String(err)
      return r
    }
  }

  /**
   * 断点续跑时，把已存步骤里的中间产物恢复到 ctx。
   */
  private restoreFromStep(step: WorkflowStepResult, ctx: WorkflowContext) {
    if (step.index === 0 && step.content) ctx.brief = (step.content as any).brief ?? ctx.brief
    if (step.index === 1 && step.content) ctx.strategy = step.content as Record<string, unknown>
    if (step.index === 2 && step.content) ctx.creative = step.content as Record<string, unknown>
    if (step.index === 3 && (step.content as any)?.prompts) ctx.prompts = (step.content as any).prompts
  }

  // ---------- 持久化辅助 ----------

  private readState(briefJson: unknown): {
    input?: string
    steps?: WorkflowStepResult[]
    brief?: Record<string, unknown>
    strategy?: Record<string, unknown>
    creative?: Record<string, unknown>
    prompts?: string[]
    currentStep?: number
  } {
    const obj = (briefJson as Record<string, unknown>) ?? {}
    return (obj.agencyWorkflow as any) ?? {}
  }

  private async writeState(projectId: string, state: Record<string, unknown>): Promise<void> {
    const project = await prisma.project.findUnique({ where: { id: projectId } })
    const current = ((project?.briefJson as Record<string, unknown>) ?? {}) as Record<string, unknown>
    await prisma.project.update({
      where: { id: projectId },
      data: { briefJson: { ...current, agencyWorkflow: state } as any },
    })
  }
}

/**
 * 从 AI 文本中提取第一个 JSON 对象。
 */
function parseJsonObject(raw: string): Record<string, unknown> {
  const text = raw.trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('AI 返回内容中未找到合法的 JSON 对象')
  }
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    throw new Error('AI 返回的 JSON 解析失败')
  }
}

export const workflowEngine = new WorkflowEngine()
