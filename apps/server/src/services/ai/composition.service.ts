import sharp from 'sharp'
import { prisma } from '../../config'
import { saveBuffer } from '../../utils/storage'

/**
 * 合成位置（相对环境图坐标系，单位为像素）
 */
export interface ComposePosition {
  x: number
  y: number
  width: number
  height: number
}

/**
 * composeToEnvironment 入参
 */
export interface ComposeOptions {
  /** 真实环境照片的本地路径 */
  environmentImagePath: string
  /** 设计图（门头方案）的本地路径 */
  designImagePath: string
  /** 设计图叠加到环境图的位置与尺寸；缺省则居中并缩放到环境图宽度的 60% */
  position?: ComposePosition
  /** 输出格式，默认 png */
  outputFormat: 'png' | 'jpeg'
}

/**
 * composeToEnvironment 返回
 */
export interface ComposeResult {
  buffer: Buffer
  assetId: string
  url: string
}

/**
 * 环境合成服务：把生成的门头 / 设计方案叠加到真实环境照片上。
 *
 * 第一阶段实现：基于 sharp 的尺寸适配 + 居中（或指定位置）叠加。
 * 合成结果会直接落盘并写入 Asset 表（type = composited_preview）。
 */
export class CompositionService {
  /**
   * 将设计图合成到环境图上。
   * @param options 环境图路径、设计图路径、叠加位置、输出格式
   * @param meta 关联元数据（用于创建 Asset），至少包含 userId 与 projectId
   * @returns 合成后的图片 Buffer 与已落盘的 Asset 信息
   */
  async composeToEnvironment(
    options: ComposeOptions,
    meta: { userId?: string; projectId?: string },
  ): Promise<ComposeResult> {
    try {
      // 1. 读取环境图元数据（宽高）
      const envMeta = await sharp(options.environmentImagePath).metadata()
      const envWidth = envMeta.width || 1024
      const envHeight = envMeta.height || 768

      // 2. 计算叠加位置（缺省：居中，宽度取环境图 60%）
      const pos: ComposePosition = options.position ?? {
        x: Math.round(envWidth * 0.2),
        y: Math.round(envHeight * 0.2),
        width: Math.round(envWidth * 0.6),
        height: Math.round(envHeight * 0.6),
      }

      // 3. 把设计图 resize 到目标尺寸（保持比例填充，避免变形）
      const resizedDesign = await sharp(options.designImagePath)
        .resize(pos.width, pos.height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toBuffer()

      // 4. 合成：把设计图 composite 到环境图指定位置
      const outputFormat = options.outputFormat || 'png'
      const composite = sharp(options.environmentImagePath)
        .composite([{ input: resizedDesign, left: pos.x, top: pos.y }])

      const buffer: Buffer =
        outputFormat === 'jpeg' ? await composite.jpeg({ quality: 90 }).toBuffer() : await composite.png().toBuffer()

      // 5. 落盘 + 创建 Asset
      const { filename, url } = await saveBuffer(buffer, outputFormat)
      const asset = await prisma.asset.create({
        data: {
          userId: meta.userId,
          projectId: meta.projectId,
          type: 'composited_preview',
          storageKey: filename,
          url,
          mimeType: outputFormat === 'jpeg' ? 'image/jpeg' : 'image/png',
          width: envWidth,
          height: envHeight,
          metadataJson: {
            environmentImagePath: options.environmentImagePath,
            designImagePath: options.designImagePath,
            position: pos,
            outputFormat,
          } as any,
        },
      })

      return { buffer, assetId: asset.id, url }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`环境合成失败：${msg}`)
    }
  }
}

export const compositionService = new CompositionService()
