import { randomUUID } from 'crypto'
import { env, redisConnection } from '../../config'
import { getOpenAIImageProviderConfig } from '../provider-config.service'

/**
 * 生图提交参数
 */
export interface SubmitJobOptions {
  /** 模型，默认 gpt-image-2 */
  model?: string
  /** 尺寸，如 1024x1024 / 768x1365 */
  size?: string
  /** 生成数量 1-4 */
  n?: number
  /** 质量 standard | hd */
  quality?: 'standard' | 'hd'
}

/**
 * 单张生成结果
 */
export interface ImageResultItem {
  url?: string
  b64_json?: string
}

/**
 * 任务轮询状态
 */
export interface PollStatusResult {
  status: 'pending' | 'succeeded' | 'failed'
  results?: ImageResultItem[]
  error?: string
}

/**
 * 轮询瞬时错误重试上限（仅对网络异常 / 5xx 重试，4xx 视为终态不重试）
 */
const POLL_MAX_ATTEMPTS = 3

/**
 * 延时工具
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * OpenAI 兼容图像服务（GPT-image-2 · 同步为主）。
 *
 * 默认走「同步」主路径（对齐参考项目 gpt_image_playground 的可用实现）：
 *  - POST /images/generations，body 带 response_format=b64_json，图片以内联 base64 直接返回；
 *  - 结果写入 Redis 缓存，返回 sync- 前缀 taskId，pollStatus 命中缓存即刻返回成功。
 *  - 好处：无需网关支持 background/async 异步语义，也无需 Worker 再回源访问临时 URL。
 *
 * 仅当显式 OPENAI_IMAGE_MODE=async 时启用异步协议自适应（需网关支持）：
 *  1) OpenAI 官方异步：POST /images/generations（带 background）→ 返回 id，轮询 GET /images/generations/{id}。
 *  2) 网关 /async 路径：POST /images/generations/async → 轮询 GET /images/generations/async/{id}。
 *
 * taskId 前缀：sync-（同步缓存）/ off-（官方异步）/ gw-（网关异步路径）。
 */
export class OpenAIImageService {
  /** 生图网关 baseURL（去掉结尾斜杠） */
  private baseURL: string
  constructor() {
    this.baseURL = ''
  }

  /** 当前生图模式（默认 sync：同步为主） */
  private get mode(): 'async' | 'sync' | 'auto' {
    return (env.openaiImageMode as 'async' | 'sync' | 'auto') || 'sync'
  }

  /**
   * 把内联结果写入 Redis 缓存，返回一个可轮询的同步 taskId。
   */
  private async cacheInline(results: ImageResultItem[]): Promise<string> {
    const tid = `sync-${randomUUID()}`
    await redisConnection.set(
      `imgtask:${tid}`,
      JSON.stringify({ status: 'succeeded', results }),
      'EX',
      1800,
    )
    return tid
  }

  /**
   * 提交生图任务。
   * - 默认 sync / auto：同步为主，POST /images/generations（response_format=b64_json）内联拿图。
   * - 仅 async：异步提交，协议自适应（官方 background 优先 → 网关 /async 路径回退，需网关支持）。
   * @returns 任务 ID（带协议前缀，供 pollStatus 轮询）
   */
  async submitJob(prompt: string, options: SubmitJobOptions = {}): Promise<{ taskId: string }> {
    const provider = await getOpenAIImageProviderConfig()
    if (!provider.enabled) throw new Error('生图 Provider 已停用，请联系管理员')
    this.apiKey = provider.apiKey
    this.baseURL = (provider.baseUrl || '').replace(/\/+$/, '')
    const model = options.model || provider.model
    const size = options.size || '1024x1024'
    const n = Math.min(Math.max(options.n ?? 1, 1), 4)

    if (this.mode === 'async') {
      return this.submitAsync(prompt, { model, size, n })
    }
    // 默认「同步为主」
    return this.submitSync(prompt, { model, size, n })
  }

  /**
   * 同步生图（主路径）：POST /images/generations，response_format=b64_json 内联返回图片。
   * 结果写入 Redis 缓存并返回 sync- 前缀 taskId，pollStatus 命中缓存即刻返回成功。
   * 手写 fetch（非 SDK）：body 可自由携带 response_format，请求头也不含 SDK 遥测头（规避网关 WAF）。
   */
  private apiKey = ''

  private async submitSync(
    prompt: string,
    opts: { model: string; size: string; n: number },
  ): Promise<{ taskId: string }> {
    if (!this.apiKey) throw new Error('未配置生图 API Key（环境变量 OPENAI_IMAGE_API_KEY）')
    if (!this.baseURL) throw new Error('未配置生图网关地址（环境变量 OPENAI_IMAGE_BASE_URL，需包含 /v1）')

    const url = `${this.baseURL}/images/generations`
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
      // 伪装普通 UA，避免网关 WAF 因 SDK 遥测特征拦截
      'User-Agent': 'Mozilla/5.0 (compatible; AdCraft/1.0)',
    }
    const basePayload: Record<string, unknown> = {
      model: opts.model,
      prompt,
      size: opts.size,
      n: opts.n,
    }

    // 优先带 response_format=b64_json（图片内联返回，Worker 无需再回源访问临时 URL）；
    // 若网关不认该参数（400 unknown/unsupported parameter），去掉后重试一次。
    let resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...basePayload, response_format: 'b64_json' }),
    })
    if (resp.status === 400) {
      const errText = await resp.text().catch(() => '')
      if (/response_format|unknown|unsupported|not\s*support|invalid.*parameter/i.test(errText)) {
        resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(basePayload) })
      } else {
        throw new Error(`生图请求失败（HTTP 400）：${errText.slice(0, 300)}`)
      }
    }
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      throw new Error(`生图请求失败（HTTP ${resp.status}）：${errText.slice(0, 300)}`)
    }

    const data = (await resp.json()) as Record<string, unknown>
    const results = normalizeResults(data)
    if (results.length === 0) {
      throw new Error(`生图接口未返回图片数据：${JSON.stringify(data).slice(0, 300)}`)
    }
    return { taskId: await this.cacheInline(results) }
  }

  /**
   * 异步生图（可选，仅 OPENAI_IMAGE_MODE=async 时启用）：协议自适应，
   * 官方 background 优先 → 网关 /async 路径回退。需网关支持相应异步语义。
   */
  private async submitAsync(
    prompt: string,
    opts: { model: string; size: string; n: number },
  ): Promise<{ taskId: string }> {
    const { model, size, n } = opts

    // ===== 1) 优先 OpenAI 官方异步（background 触发） =====
    try {
      const resp = await fetch(`${this.baseURL}/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model, prompt, size, n, background: true, async: true }),
      })
      if (resp.ok) {
        const data = (await resp.json()) as Record<string, unknown>
        const id = (data.id || data.task_id || data.taskId) as string | undefined
        if (id) return { taskId: `off-${id}` }
        const inline = normalizeResults(data)
        if (inline.length > 0) return { taskId: await this.cacheInline(inline) }
      } else if (resp.status !== 404 && resp.status !== 405 && resp.status !== 400) {
        const errText = await resp.text().catch(() => '')
        throw new Error(`生图提交失败（HTTP ${resp.status}）：${errText.slice(0, 300)}`)
      }
    } catch (err) {
      const status = (err as { status?: number }).status
      if (status !== undefined && status < 500 && status !== 404 && status !== 405 && status !== 400) {
        throw err
      }
    }

    // ===== 2) 回退：网关 /async 路径 =====
    try {
      const resp = await fetch(`${this.baseURL}/images/generations/async`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model, prompt, size, n, async: true }),
      })
      if (resp.ok) {
        const data = (await resp.json()) as Record<string, unknown>
        const id = (data.id || data.task_id || data.taskId) as string | undefined
        if (id) return { taskId: `gw-${id}` }
        const inline = normalizeResults(data)
        if (inline.length > 0) return { taskId: await this.cacheInline(inline) }
        throw new Error('异步生图接口未返回任务 ID 或结果')
      }
      if (resp.status === 404 || resp.status === 405) {
        // 网关不支持异步 → 回退同步主路径
        return this.submitSync(prompt, opts)
      }
      const errText = await resp.text().catch(() => '')
      throw new Error(`异步生图提交失败（HTTP ${resp.status}）：${errText.slice(0, 300)}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`提交生图任务失败：${msg}`)
    }
  }

  /**
   * 轮询任务状态。
   * 先查 Redis 中的同步回退结果；未命中再根据 taskId 前缀选择对应协议的轮询地址。
   * 对网络异常 / 5xx 做指数退避重试，避免上游瞬时抖动造成「假失败」；
   * 4xx（鉴权失败 / 任务不存在）视为终态，直接失败不重试。
   * @param taskId submitJob 返回的任务 ID（可能带 off-/gw-/sync- 前缀）
   */
  async pollStatus(taskId: string): Promise<PollStatusResult> {
    try {
      // 先检查 Redis 中的同步回退结果（命中即返回，无需重试）
      const cached = await redisConnection.get(`imgtask:${taskId}`)
      if (cached) {
        return JSON.parse(cached) as PollStatusResult
      }

      if (taskId.startsWith('off-')) {
        return await this.pollWithUrl(
          `${this.baseURL}/images/generations/${encodeURIComponent(taskId.slice(3))}`,
        )
      }
      if (taskId.startsWith('gw-')) {
        return await this.pollWithUrl(
          `${this.baseURL}/images/generations/async/${encodeURIComponent(taskId.slice(3))}`,
        )
      }
      throw new Error(`未知生图任务类型：${taskId}`)
    } catch (err) {
      // 直接上抛原始错误，避免重复包装前缀、保留完整堆栈便于定位
      throw err
    }
  }

  /**
   * 对单个轮询地址执行带重试的 GET，并规整为统一的 PollStatusResult。
   */
  private async pollWithUrl(url: string): Promise<PollStatusResult> {
    let lastErr: unknown
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      try {
        const resp = await fetch(url, {
          method: 'GET',
          headers: { Authorization: `Bearer ${this.apiKey}` },
        })
        if (!resp.ok) {
          const errText = await resp.text().catch(() => '')
          const err = new Error(
            `轮询生图状态失败（HTTP ${resp.status}）：${errText.slice(0, 300)}`,
          ) as Error & { status?: number }
          err.status = resp.status
          throw err
        }
        const data = (await resp.json()) as Record<string, unknown>
        return this.normalizePoll(data)
      } catch (err) {
        lastErr = err
        const status = (err as { status?: number }).status
        // 4xx 为终态错误，不重试
        if (status !== undefined && status < 500) throw err
        // 5xx 或网络异常：指数退避后重试
        if (attempt < POLL_MAX_ATTEMPTS - 1) {
          await sleep(1000 * (attempt + 1))
          continue
        }
      }
    }
    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr)
    throw new Error(`轮询生图状态失败：${msg}`)
  }

  /**
   * 把不同代理返回的状态字段与结果结构规整为统一的 PollStatusResult。
   */
  private normalizePoll(data: Record<string, unknown>): PollStatusResult {
    const rawStatus = String(data.status || data.task_status || 'pending').toLowerCase()
    const status: PollStatusResult['status'] =
      rawStatus === 'succeeded' || rawStatus === 'success' || rawStatus === 'completed'
        ? 'succeeded'
        : rawStatus === 'failed' || rawStatus === 'error'
          ? 'failed'
          : 'pending'

    if (status === 'succeeded') {
      return { status, results: normalizeResults(data) }
    }
    if (status === 'failed') {
      return { status, error: String(data.error || data.err_msg || '生图任务失败') }
    }
    return { status: 'pending' }
  }
}

/**
 * 把不同代理返回的结果结构规整为统一的 ImageResultItem[]。
 * 兼容：results / data / output / images / result（数组或单对象）/ 顶层 url·b64_json。
 */
function normalizeResults(data: Record<string, unknown>): ImageResultItem[] {
  // 候选容器（按常见程度排列）
  const candidates = [data.results, data.data, data.output, data.images, data.result]
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) {
      const mapped = c
        .map((item) => {
          const it = (item ?? {}) as Record<string, unknown>
          return {
            url: (it.url ?? it.image_url ?? it.imageUrl) as string | undefined,
            b64_json: (it.b64_json ?? it.b64) as string | undefined,
          }
        })
        .filter((r) => r.url || r.b64_json)
      if (mapped.length > 0) return mapped
    }
  }
  // 容器是单个对象（如 result: {url} 或 {b64_json}）
  const single = data.result as Record<string, unknown> | undefined
  if (single && !Array.isArray(single)) {
    const url = (single.url ?? single.image_url ?? single.imageUrl) as string | undefined
    const b64 = (single.b64_json ?? single.b64) as string | undefined
    if (url || b64) return [{ url, b64_json: b64 }]
  }
  // 顶层单张
  if (data.url || data.b64_json || data.image_url) {
    return [
      {
        url: (data.url ?? data.image_url) as string | undefined,
        b64_json: data.b64_json as string | undefined,
      },
    ]
  }
  return []
}
