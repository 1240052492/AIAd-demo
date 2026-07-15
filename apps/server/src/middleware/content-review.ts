import { Request, Response, NextFunction } from 'express'

/** 图片内容审核结果 */
export interface ReviewResult {
  safe: boolean
  /** 不安全时的原因说明（可选，用于返回给调用方 / 日志） */
  reason?: string
}

/**
 * 图片内容安全审核（NSFW 检测）。
 *
 * MVP 行为：默认直接返回 `{ safe: true }`，不阻断任何上传 / 图片服务。
 *
 * 受环境变量 `NSFW_ENABLED` 控制：
 *  - `NSFW_ENABLED !== 'true'`：始终放行（MVP 默认）。
 *  - `NSFW_ENABLED === 'true'`：进入审核分支（当前仍为占位放行，需补齐真实分类器）。
 *
 * TODO(security): 接入真实 NSFW 分类器，例如：
 *  - AWS Rekognition `DetectModerationLabels`
 *  - 本地模型（如 nsfwjs / ONNX / TensorFlow）
 *  - 第三方内容审核 API
 * 实现时在此处调用模型，并将结果映射为 `{ safe, reason }`。
 */
export async function reviewImage(_buffer: Buffer): Promise<ReviewResult> {
  if (process.env.NSFW_ENABLED !== 'true') {
    // MVP：未启用审核，直接放行。
    return { safe: true }
  }

  // 启用审核却没有配置分类器时必须 fail-closed，避免运维误以为审核已生效。
  return { safe: false, reason: '内容安全审核已启用，但分类服务尚未配置' }
}

/**
 * Express 中间件工厂：在「图片上传 / 图片服务」路由中对请求体或文件做内容审核。
 *
 * ⚠️ 本 agent 不拥有 admin.ts / image-jobs.ts / app.ts，故仅导出函数与用法示例，
 * 不主动挂载到任何他人拥有的路由。需要接入时由路由所有者调用本工厂。
 *
 * 用法示例（仅说明，请勿在本 agent 改动范围外擅自挂载）：
 *
 *   import { nsfwCheckUpload } from '../middleware/content-review'
 *   import multer from 'multer'
 *   const upload = multer({ limits: { fileSize: 20 * 1024 * 1024 } })
 *
 *   // 上传路由：先 multer 解析出 buffer，再做审核
 *   router.post('/upload', upload.single('file'), nsfwCheckUpload(), handler)
 *
 *   // 图片服务路由：对即将吐出的图片 buffer 做审核
 *   router.get('/image/:id', nsfwCheckUpload(), handler)
 *
 * 当 `NSFW_ENABLED=true` 且图片不安全时，返回 422（Unprocessable Entity）；
 * 若你的语义更偏「不支持的媒体类型」，也可改为 415（Unsupported Media Type）。
 */
export function nsfwCheckUpload() {
  return async (req: Request, res: Response, next: NextFunction) => {
    // 未启用审核：直接放行。
    if (process.env.NSFW_ENABLED !== 'true') {
      return next()
    }

    // 收集需要审核的图片 buffer：
    // 1) multer 单文件上传：req.file.buffer
    // 2) 无 multer 时的原始 body（Buffer）
    const buffers: Buffer[] = []
    const file = (req as Request & { file?: { buffer?: Buffer } }).file
    if (file?.buffer) buffers.push(file.buffer)
    const rawBody = (req as Request & { body?: unknown }).body
    if (buffers.length === 0 && Buffer.isBuffer(rawBody)) {
      buffers.push(rawBody)
    }

    // 没有可审核的图片数据：放行（如需更严格可改为 400）。
    if (buffers.length === 0) {
      return next()
    }

    try {
      for (const buf of buffers) {
        const result = await reviewImage(buf)
        if (!result.safe) {
          return res.status(422).json({
            code: 422,
            message: `图片内容未通过安全审核${result.reason ? `：${result.reason}` : ''}`,
            data: null,
          })
        }
      }
      return next()
    } catch (err) {
      console.error('[content-review] 审核过程异常', err)
      // 审核服务异常时的策略：MVP 默认放行（生产可改为拒绝并返回 503）。
      return next()
    }
  }
}
