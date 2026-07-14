import path from 'path'
import sharp from 'sharp'
import { prisma, env } from '../../config'
import { getStorageDir, saveBuffer } from '../../utils/storage'
import { ValidationError } from '../../utils/errors'
import type { TextValidationRecord } from './text-validation.service'

export interface TextCorrection {
  expectedText: string
  regionId?: string
  x: number
  y: number
  width: number
  height: number
  fontSize: number
  textColor: string
  coverColor: string
}

interface ApplyCorrectionsInput {
  userId: string
  projectId?: string | null
  generationJobId: string
  sourceAsset: {
    storageKey: string
    type: string
  }
  expectedTexts: string[]
  textValidation?: TextValidationRecord
  corrections: unknown[]
}

function normalizeText(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s·・.。,'"“”‘’\-_:：，,;；!?！？()（）\[\]【】]/g, '')
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    }
    return entities[character] || character
  })
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function finite(value: unknown, label: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new ValidationError(`${label} 必须是有效数字`)
  return parsed
}

function color(value: unknown, fallback: string, label: string): string {
  const candidate = typeof value === 'string' && value.trim() ? value.trim() : fallback
  if (!/^#[0-9a-fA-F]{6}$/.test(candidate)) throw new ValidationError(`${label} 必须是 6 位十六进制颜色`)
  return candidate
}

function sourcePath(storageKey: string): string {
  const storageRoot = getStorageDir()
  const fullPath = path.resolve(storageRoot, storageKey)
  const relative = path.relative(storageRoot, fullPath)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new ValidationError('素材文件不在本地存储目录内')
  }
  return fullPath
}

function correctionFromInput(
  input: unknown,
  expectedTexts: string[],
  validation: TextValidationRecord | undefined,
  imageWidth: number,
  imageHeight: number,
): TextCorrection {
  if (!input || typeof input !== 'object') throw new ValidationError('每个修正项必须是对象')
  const record = input as Record<string, unknown>
  const expectedText = typeof record.expectedText === 'string' ? record.expectedText.trim().replace(/\s+/g, ' ') : ''
  if (!expectedText || expectedText.length > 80) throw new ValidationError('expectedText 必须为 1-80 个字符')
  if (!expectedTexts.some((text) => normalizeText(text) === normalizeText(expectedText))) {
    throw new ValidationError('expectedText 必须属于该任务的需原样显示文字')
  }

  const regionId = typeof record.regionId === 'string' && record.regionId ? record.regionId : undefined
  if (regionId && !validation?.regions.some((region) => region.id === regionId)) {
    throw new ValidationError('regionId 不属于该任务的 OCR 结果')
  }

  const x = clamp(finite(record.x, 'x'), 0, Math.max(0, imageWidth - 8))
  const y = clamp(finite(record.y, 'y'), 0, Math.max(0, imageHeight - 8))
  const width = clamp(finite(record.width, 'width'), 8, Math.max(8, imageWidth - x))
  const height = clamp(finite(record.height, 'height'), 8, Math.max(8, imageHeight - y))
  const proposedFontSize = record.fontSize === undefined ? height * 0.68 : finite(record.fontSize, 'fontSize')

  return {
    expectedText,
    regionId,
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
    fontSize: Math.round(clamp(proposedFontSize, 10, Math.max(12, height * 1.1))),
    textColor: color(record.textColor, '#111827', 'textColor'),
    coverColor: color(record.coverColor, '#ffffff', 'coverColor'),
  }
}

function renderSvg(width: number, height: number, corrections: TextCorrection[]): Buffer {
  const fontFamily = escapeXml(env.textRenderFontFamily)
  const layers = corrections
    .map((correction) => {
      const padding = Math.min(28, Math.max(4, Math.round(correction.height * 0.1)))
      const coverX = clamp(correction.x - padding, 0, width)
      const coverY = clamp(correction.y - padding, 0, height)
      const coverWidth = clamp(correction.width + padding * 2, 1, width - coverX)
      const coverHeight = clamp(correction.height + padding * 2, 1, height - coverY)
      const maxFont = Math.max(
        10,
        Math.floor(((correction.width - padding * 2) / Math.max(1, correction.expectedText.length)) * 0.95),
      )
      const fontSize = Math.min(correction.fontSize, maxFont)
      const centerX = correction.x + correction.width / 2
      const centerY = correction.y + correction.height / 2
      return [
        `<rect x="${coverX}" y="${coverY}" width="${coverWidth}" height="${coverHeight}" rx="${Math.min(12, coverHeight / 5)}" fill="${correction.coverColor}"/>`,
        `<text x="${centerX}" y="${centerY}" text-anchor="middle" dominant-baseline="central" font-family="${fontFamily}" font-size="${fontSize}" font-weight="700" fill="${correction.textColor}">${escapeXml(correction.expectedText)}</text>`,
      ].join('')
    })
    .join('')
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${layers}</svg>`)
}

export class TextCorrectionService {
  async apply(input: ApplyCorrectionsInput) {
    if (!Array.isArray(input.corrections) || input.corrections.length < 1 || input.corrections.length > 8) {
      throw new ValidationError('请提供 1-8 个文字修正项')
    }
    const filePath = sourcePath(input.sourceAsset.storageKey)
    const image = sharp(filePath, {
      limitInputPixels: env.textRenderMaxInputPixels,
      sequentialRead: true,
    })
    const metadata = await image.metadata()
    const width = metadata.width
    const height = metadata.height
    if (!width || !height) throw new ValidationError('无法读取源图片尺寸')

    const corrections = input.corrections.map((item) =>
      correctionFromInput(item, input.expectedTexts, input.textValidation, width, height),
    )
    const unique = new Set(corrections.map((item) => normalizeText(item.expectedText)))
    if (unique.size !== corrections.length) throw new ValidationError('每个需显示文字只能修正一次')

    const buffer = await sharp(filePath, {
      limitInputPixels: env.textRenderMaxInputPixels,
      sequentialRead: true,
    })
      .composite([{ input: renderSvg(width, height, corrections), left: 0, top: 0 }])
      .png()
      .toBuffer()

    const saved = await saveBuffer(buffer, 'png')
    const asset = await prisma.asset.create({
      data: {
        userId: input.userId,
        projectId: input.projectId || null,
        generationJobId: input.generationJobId,
        type: 'corrected',
        storageKey: saved.filename,
        url: saved.url,
        mimeType: 'image/png',
        width,
        height,
        size: buffer.length,
        metadataJson: {
          sourceStorageKey: input.sourceAsset.storageKey,
          sourceType: input.sourceAsset.type,
          corrections,
        } as any,
      },
    })

    return { asset, corrections }
  }
}

export const textCorrectionService = new TextCorrectionService()
