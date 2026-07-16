import OpenAI from 'openai'
import { env } from '../../config'

export function normalizeOpenAICompatibleBaseUrl(value: string): string | undefined {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) return undefined
  return /\/v1$/i.test(trimmed) ? trimmed : `${trimmed}/v1`
}

/**
 * 业务类型 -> 中文标签映射（用于向 AI 注入更明确的语境）
 */
export const BUSINESS_TYPE_LABELS: Record<string, string> = {
  storefront_sign: '门头招牌',
  culture_wall: '文化墙',
  lightbox: '灯箱广告',
  poster: '海报',
  brand_vi: '品牌 VI 设计',
  packaging: '包装设计',
  social_media: '社媒视觉',
}

/**
 * AE（客户执行）系统提示词：注入 Agency Workflow Skills 中 account-executive 的方法论。
 */
const AE_SYSTEM_PROMPT = `你是一家资深广告公司的客户执行（Account Executive，简称 AE），擅长把客户零散、口语化的需求整理成专业、可执行的标准广告 Brief。

你的工作方法论：
1. 完整收集客户 Brief 的十要素：品牌、产品/服务、项目背景、核心问题、商业目标、传播目标、目标人群、投放渠道、交付物形态、限制条件（预算/尺寸/风格/周期）。
2. 严格区分三类信息：
   - 「已确认事实」：客户明确给出的信息；
   - 「合理推断」：基于常识可做的安全假设；
   - 「待确认问题」：缺失但会影响产出的关键信息，必须主动列出清单向客户追问。
3. 当资料不足时，不要臆造，而是输出缺失问题清单（missingQuestions），引导客户补充。
4. 结合业务类型（如门头招牌 / 文化墙）给出符合行业惯例的目标人群与视觉方向建议。
5. 基于 Brief 产出一条「优化后的英文生图提示词（imagePrompt）」，要求：主体明确、风格与材质具体、构图与光线可描述、适配对应业务场景，且能直接送入文生图模型。
6. 输出面向工厂落地的「施工说明草稿（productionNotes）」：材质、工艺、安装方式、尺寸校验等；以及交付前需警惕的「风险预警（riskWarnings）」：尺寸冲突、材质不合规、版权风险、与物业/市容规范冲突等。

输出要求：仅返回一个 JSON 对象，不要包含任何解释性文字、不要使用 Markdown 代码块。
- missingQuestions / productionNotes / riskWarnings / imagePrompt 必须位于**顶层**（与 brief 同级），不要嵌套进 brief 内部。
- 若某项无内容，返回空数组 [] 而非 null。

JSON 结构如下：
{
  "brief": {
    "businessType": "业务类型（英文 key）",
    "targetAudience": "目标受众描述",
    "visualDirection": "视觉方向概述",
    "storeName": "店名/品牌名（如有）",
    "industry": "行业（如有）",
    "style": "风格关键词（如有）",
    "dimensions": "关键尺寸/比例（如有，如门宽4米、9:16）",
    "material": "推荐材质（如有）",
    "lighting": "灯光方式（如有）"
  },
  "missingQuestions": ["缺失问题1", "缺失问题2"],
  "productionNotes": ["施工说明草稿1（材质/工艺/安装/尺寸校验）", "施工说明草稿2"],
  "riskWarnings": ["风险预警1（尺寸冲突/材质不合规/版权/物业规范）"],
  "imagePrompt": "优化后的英文生图提示词"
}`

/**
 * 生成 Brief 的请求参数
 */
export interface GenerateBriefParams {
  /** 业务类型，如 storefront_sign / culture_wall */
  businessType: string
  /** 客户原始需求描述 */
  clientText: string
  /** 约束条件：预算、风格、尺寸等 */
  constraints?: Record<string, string>
}

/**
 * Brief 产出的结构化结果（顶层携带 missingQuestions / productionNotes / riskWarnings，
 * 与方案文档「Claude 输出 JSON」结构一致）
 */
export interface GenerateBriefResult {
  brief: {
    businessType: string
    targetAudience: string
    visualDirection: string
    storeName?: string
    industry?: string
    style?: string
    dimensions?: string
    material?: string
    lighting?: string
  }
  /** 缺失问题清单（顶层，引导客户补充） */
  missingQuestions: string[]
  /** 面向工厂落地的施工说明草稿 */
  productionNotes: string[]
  /** 交付前需警惕的风险预警 */
  riskWarnings: string[]
  /** 优化后的、可直接用于生图的英文提示词 */
  imagePrompt: string
}

/**
 * 通用对话请求参数
 */
export interface CompleteParams {
  /** 系统提示词 */
  system: string
  /** 用户消息 */
  user: string
  /** 最大输出 token，默认 1500 */
  maxTokens?: number
  /** 温度，默认 0.7 */
  temperature?: number
}

/**
 * 文本 AI 服务（Claude / 任意 OpenAI 兼容 Provider）。
 *
 * 默认通过 sub2api 等 OpenAI 兼容中转代理访问大模型（chat/completions 接口），
 * 因此这里直接使用 `openai` SDK 的 chat.completions，避免原生 Anthropic SDK
 * 的 /v1/messages 端点与大多数中转代理不兼容的问题。
 *
 * 注意：构造函数不再因为缺少 API Key 而抛错，Key 校验延后到真正发起请求时，
 * 这样即使未配置 AI Key，服务也能正常启动并对外提供非 AI 类接口（鉴权/项目/积分等）。
 */
export class AnthropicService {
  private client: OpenAI | null = null

  constructor() {
    // 延迟初始化：只有真正需要调用模型时才创建 client 并校验 Key
  }

  private ensureClient(): OpenAI {
    const apiKey = env.anthropicApiKey
    const baseURL = normalizeOpenAICompatibleBaseUrl(env.anthropicBaseUrl)
    if (!apiKey) {
      throw new Error('未配置 AI 文本 Provider 的 API Key（环境变量 ANTHROPIC_API_KEY）')
    }
    if (!this.client) {
      // 部分网关的 WAF 会拦截 OpenAI SDK 默认注入的 x-stainless-* 遥测头，返回 403 "Your request was blocked"。
      // 用自定义 fetch 剥离这些头并伪装普通 UA，让请求真正到达网关（拿到真实错误而非被 WAF 误杀）。
      const cleanFetch: typeof fetch = (url, init) => {
        const headers = new Headers(init?.headers)
        for (const k of [...headers.keys()]) if (k.toLowerCase().startsWith('x-stainless')) headers.delete(k)
        headers.set('user-agent', 'Mozilla/5.0 (compatible; AdCraft/1.0)')
        return fetch(url as any, { ...(init as any), headers } as any)
      }
      this.client = new OpenAI({ apiKey, baseURL, fetch: cleanFetch as any })
    }
    return this.client
  }

  /**
   * 生成广告 Brief：把客户原始需求整理成标准广告 brief + 优化后的英文生图提示词。
   * @param params 业务类型、客户原文与约束
   * @returns 结构化 brief 与 imagePrompt
   * @throws 当 API 调用或 JSON 解析失败时抛出中文错误
   */
  async generateBrief(params: GenerateBriefParams): Promise<GenerateBriefResult> {
    try {
      const businessLabel = BUSINESS_TYPE_LABELS[params.businessType] || params.businessType
      const constraintsText = params.constraints
        ? '\n客户约束条件：\n' + Object.entries(params.constraints).map(([k, v]) => `- ${k}: ${v}`).join('\n')
        : ''

      const userText =
        `【业务类型】${businessLabel}\n` +
        `【客户原始需求】\n${params.clientText}\n` +
        `${constraintsText}\n\n` +
        `请基于以上信息，按 AE 方法论输出标准广告 Brief 及优化后的英文生图提示词，仅返回 JSON。`

      const raw = await this.complete({ system: AE_SYSTEM_PROMPT, user: userText, maxTokens: 2048 })
      const parsed = parseJsonObject(raw)
      return normalizeBrief(parsed, params.businessType)
    } catch (err) {
      throw new Error(`生成广告 Brief 失败：${errorMessage(err)}`)
    }
  }

  /**
   * 通用文本补全：向大模型发送 system + user，返回纯文本。
   * 供 PromptService、WorkflowEngine 等工作流步骤复用。
   * @param params 系统提示词、用户消息、可选 token/温度
   */
  async complete(params: CompleteParams): Promise<string> {
    try {
      const client = this.ensureClient()
      const completion = await client.chat.completions.create(
        {
          model: env.anthropicModel,
          max_tokens: params.maxTokens ?? 1500,
          temperature: params.temperature ?? 0.7,
          messages: [
            { role: 'system', content: params.system },
            { role: 'user', content: params.user },
          ],
        },
        // 60s 超时，避免长时间挂起
        { timeout: 60_000 },
      )
      return extractText(completion)
    } catch (err) {
      throw new Error(`调用 AI 文本模型失败：${errorMessage(err)}`)
    }
  }
}

/**
 * 从 OpenAI ChatCompletion 响应中提取拼接后的纯文本。
 */
function extractText(completion: OpenAI.Chat.Completions.ChatCompletion): string {
  const payload = completion as unknown as Record<string, unknown>
  const choices = Array.isArray(payload.choices)
    ? payload.choices
    : Array.isArray(payload.completionChoices)
      ? payload.completionChoices
      : []
  if (choices.length === 0) {
    throw new Error('AI 文本 Provider 返回格式异常：缺少可用 choices')
  }

  const texts: string[] = []
  for (const rawChoice of choices) {
    if (!rawChoice || typeof rawChoice !== 'object') continue
    const choice = rawChoice as Record<string, unknown>
    const message = choice.message
    const content =
      message && typeof message === 'object'
        ? (message as Record<string, unknown>).content
        : choice.content ?? choice.text
    if (typeof content === 'string') {
      texts.push(content)
    } else if (Array.isArray(content)) {
      for (const part of content) {
        if (typeof part === 'string') texts.push(part)
        else if (part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string') {
          texts.push((part as Record<string, string>).text)
        }
      }
    }
  }
  const text = texts.join('').trim()
  if (!text) throw new Error('AI 文本 Provider 返回格式异常：未找到文本内容')
  return text
}

/**
 * 从可能包含代码块/多余文字的文本中提取第一个 JSON 对象。
 */
function parseJsonObject(raw: string): Record<string, unknown> {
  const text = raw.trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('AI 返回内容中未找到合法的 JSON 对象')
  }
  const jsonStr = text.slice(start, end + 1)
  try {
    return JSON.parse(jsonStr) as Record<string, unknown>
  } catch {
    throw new Error('AI 返回的 JSON 解析失败')
  }
}

/**
 * 把任意值规整为字符串数组（过滤空项）。
 */
function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean)
  if (typeof v === 'string' && v.trim()) return [v]
  return []
}

/**
 * 把 AI 返回的任意结构规整为 GenerateBriefResult 强类型。
 * missingQuestions / productionNotes / riskWarnings 取自顶层（兼容塞进 brief 内部的旧格式）。
 */
function normalizeBrief(parsed: Record<string, unknown>, businessType: string): GenerateBriefResult {
  const rawBrief = (parsed.brief as Record<string, unknown>) || {}

  const missingQuestions = asStringArray(parsed.missingQuestions ?? rawBrief.missingQuestions)
  const productionNotes = asStringArray(parsed.productionNotes)
  const riskWarnings = asStringArray(parsed.riskWarnings)

  const brief: GenerateBriefResult['brief'] = {
    businessType: String(rawBrief.businessType || businessType),
    targetAudience: String(rawBrief.targetAudience || ''),
    visualDirection: String(rawBrief.visualDirection || ''),
  }
  if (rawBrief.storeName) brief.storeName = String(rawBrief.storeName)
  if (rawBrief.industry) brief.industry = String(rawBrief.industry)
  if (rawBrief.style) brief.style = String(rawBrief.style)
  if (rawBrief.dimensions) brief.dimensions = String(rawBrief.dimensions)
  if (rawBrief.material) brief.material = String(rawBrief.material)
  if (rawBrief.lighting) brief.lighting = String(rawBrief.lighting)

  const imagePrompt = String(parsed.imagePrompt || rawBrief.imagePrompt || '')
  if (!imagePrompt) {
    throw new Error('AI 未返回有效的生图提示词（imagePrompt）')
  }
  return { brief, missingQuestions, productionNotes, riskWarnings, imagePrompt }
}

/**
 * 统一错误信息提取（兼容 Error 对象与异常字符串）。
 */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
