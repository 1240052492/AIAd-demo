import { AnthropicService } from './anthropic.service'

/**
 * 设计师（Designer）系统提示词：注入 Agency Workflow Skills 中 designer 的视觉方向方法论。
 */
const DESIGNER_SYSTEM_PROMPT = `你是广告公司的资深设计师（Designer），负责把创意 Brief 转化为精准、可执行的 AI 生图提示词。

你的方法论：
1. 先明确 Visual Direction（视觉方向）：风格流派、色彩系统、材质与肌理、光影与氛围、构图与景别。
2. 给出 Key Visual 描述：主体、陪体、负空间、焦点与视觉动线。
3. 把中文创意意图「翻译 + 优化」为英文生图提示词：使用具体名词、材质词、镜头词（如 wide shot / close-up）、光线词（soft daylight / neon glow）、渲染词（8k, photorealistic, cinematic）。
4. 充分发挥风格化能力，针对同一 Brief 产出 1-4 个不同视觉风格的提示词变体（如：写实摄影风、3D 渲染风、扁平插画风、国潮水墨风），覆盖多种落地可能性。

输出要求：仅返回一个 JSON 数组（字符串数组），每个元素是一条完整的英文生图提示词，不要包含解释文字、不要使用 Markdown 代码块。示例：
["a realistic storefront sign photograph ...", "a 3d rendered isometric storefront ..."]`

/**
 * 提示词优化服务：基于 Brief 生成/优化 1-4 个不同风格的 AI 生图提示词变体。
 */
export class PromptService {
  private anthropic: AnthropicService

  /**
   * @param anthropic 可注入已有的 AnthropicService 实例（复用连接与配置）
   */
  constructor(anthropic?: AnthropicService) {
    this.anthropic = anthropic ?? new AnthropicService()
  }

  /**
   * 基于 Brief 优化并产出多风格生图提示词变体。
   * @param brief 上游 AE / 策略阶段产出的 Brief 对象（任意结构均可，会整体序列化给 AI）
   * @param stylePreference 可选的风格偏好，如「国潮」「极简」「赛博朋克」
   * @returns 提示词数组（1-4 条）
   * @throws 当 AI 调用或解析失败时抛出中文错误
   */
  async optimizePrompt(brief: object, stylePreference?: string): Promise<{ prompts: string[] }> {
    try {
      const briefText = JSON.stringify(brief, null, 2)
      const styleText = stylePreference ? `\n客户额外风格偏好：${stylePreference}\n` : ''
      const user =
        `【Brief】\n${briefText}\n` +
        `${styleText}\n` +
        `请基于设计师方法论，生成 1-4 个不同视觉风格的生图提示词变体，仅返回 JSON 数组。`

      const raw = await this.anthropic.complete({
        system: DESIGNER_SYSTEM_PROMPT,
        user,
        maxTokens: 2000,
        temperature: 0.85,
      })

      const prompts = parsePromptArray(raw)
      if (prompts.length === 0) {
        throw new Error('AI 未返回任何有效提示词')
      }
      return { prompts }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`优化生图提示词失败：${msg}`)
    }
  }
}

/**
 * 从 AI 文本中提取 JSON 数组并过滤为非空字符串列表。
 */
function parsePromptArray(raw: string): string[] {
  const text = raw.trim()
  // 优先直接解析
  try {
    const arr = JSON.parse(text)
    if (Array.isArray(arr)) return arr.map((p) => String(p)).filter(Boolean)
  } catch {
    /* 忽略，走下面的宽松解析 */
  }
  // 宽松提取第一个 [ ... ]
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('AI 返回内容中未找到合法的 JSON 数组')
  }
  try {
    const arr = JSON.parse(text.slice(start, end + 1))
    if (Array.isArray(arr)) return arr.map((p) => String(p)).filter(Boolean)
  } catch {
    /* 继续 */
  }
  // 退路：按换行切分作为多条提示词
  const lines = text
    .split('\n')
    .map((l) => l.replace(/^[\s\d.\-*"'`]+/, '').replace(/["'`]+$/, '').trim())
    .filter((l) => l.length > 0 && !l.startsWith('[') && !l.startsWith(']'))
  if (lines.length > 0) return lines
  throw new Error('AI 返回的提示词解析失败')
}
