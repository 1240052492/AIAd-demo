import fs from 'fs/promises'
import path from 'path'
import { env } from '../../config'
import { getStorageDir } from '../../utils/storage'

export interface TextPoint {
  x: number
  y: number
}

export interface OcrRegion {
  id: string
  text: string
  confidence: number
  polygon: TextPoint[]
}

export interface TextValidationCheck {
  expectedText: string
  detectedText?: string
  confidence?: number
  regionId?: string
  matched: boolean
}

export interface TextValidationRecord {
  status: 'passed' | 'needs_review' | 'unavailable'
  expectedTexts: string[]
  regions: OcrRegion[]
  checks: TextValidationCheck[]
  sourceWidth?: number
  sourceHeight?: number
  scale?: number
  error?: string
  createdAt: string
  updatedAt: string
}

export interface LocalOcrAsset {
  storageKey: string
  mimeType?: string | null
}

interface OcrSidecarResponse {
  sourceWidth: number
  sourceHeight: number
  scale: number
  regions: OcrRegion[]
}

function nowIso(): string {
  return new Date().toISOString()
}

function normalizeText(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[\s·・.。,'"“”‘’\-_:：，,;；!?！？()（）\[\]【】]/g, '')
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0]
    previous[0] = leftIndex
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const saved = previous[rightIndex]
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      )
      diagonal = saved
    }
  }
  return previous[right.length]
}

function similarity(left: string, right: string): number {
  if (!left || !right) return 0
  return 1 - editDistance(left, right) / Math.max(left.length, right.length)
}

function resolveStoragePath(storageKey: string): string {
  const storageRoot = getStorageDir()
  const fullPath = path.resolve(storageRoot, storageKey)
  const relative = path.relative(storageRoot, fullPath)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('素材文件不在本地存储目录内')
  }
  return fullPath
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function point(value: unknown): TextPoint | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const x = number(record.x)
  const y = number(record.y)
  return x === null || y === null ? null : { x, y }
}

function parseRegions(value: unknown): OcrRegion[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const text = typeof record.text === 'string' ? record.text.trim() : ''
    const confidence = number(record.confidence)
    const polygon = Array.isArray(record.polygon)
      ? record.polygon.map(point).filter((point): point is TextPoint => Boolean(point))
      : []
    if (!text || confidence === null || polygon.length < 4) return []
    return [
      {
        id: typeof record.id === 'string' && record.id ? record.id : `ocr_${index + 1}`,
        text,
        confidence: Math.max(0, Math.min(1, confidence)),
        polygon,
      },
    ]
  })
}

async function callOcrSidecar(asset: LocalOcrAsset): Promise<OcrSidecarResponse> {
  const buffer = await fs.readFile(resolveStoragePath(asset.storageKey))
  const form = new FormData()
  form.append(
    'file',
    new Blob([new Uint8Array(buffer)], { type: asset.mimeType || 'image/png' }),
    path.basename(asset.storageKey),
  )
  form.append('max_edge', String(env.ocrMaxInputEdge))

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), env.ocrRequestTimeoutMs)
  try {
    const response = await fetch(`${env.ocrServiceUrl.replace(/\/+$/, '')}/ocr`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`OCR sidecar returned HTTP ${response.status}`)
    const payload = (await response.json()) as Record<string, unknown>
    const sourceWidth = number(payload.sourceWidth)
    const sourceHeight = number(payload.sourceHeight)
    const scale = number(payload.scale)
    if (!sourceWidth || !sourceHeight || !scale || scale <= 0) {
      throw new Error('OCR sidecar returned invalid geometry')
    }
    return { sourceWidth, sourceHeight, scale, regions: parseRegions(payload.regions) }
  } finally {
    clearTimeout(timeout)
  }
}

function checksFor(expectedTexts: string[], regions: OcrRegion[]): TextValidationCheck[] {
  const assigned = new Set<string>()
  return expectedTexts.map((expectedText) => {
    const normalizedExpected = normalizeText(expectedText)
    const candidate = regions
      .filter((region) => !assigned.has(region.id))
      .map((region) => ({ region, score: similarity(normalizedExpected, normalizeText(region.text)) }))
      .sort((left, right) => right.score - left.score)[0]
    if (!candidate) return { expectedText, matched: false }
    assigned.add(candidate.region.id)
    const matched =
      normalizeText(candidate.region.text) === normalizedExpected &&
      candidate.region.confidence >= env.ocrMinConfidence
    return {
      expectedText,
      detectedText: candidate.region.text,
      confidence: candidate.region.confidence,
      regionId: candidate.region.id,
      matched,
    }
  })
}

export class TextValidationService {
  async validate(expectedTexts: string[], asset?: LocalOcrAsset | null): Promise<TextValidationRecord> {
    const timestamp = nowIso()
    if (!expectedTexts.length) {
      return {
        status: 'needs_review',
        expectedTexts,
        regions: [],
        checks: [],
        error: '未设置需原样显示的文字，无法自动校验',
        createdAt: timestamp,
        updatedAt: timestamp,
      }
    }
    if (!asset) {
      return {
        status: 'unavailable',
        expectedTexts,
        regions: [],
        checks: expectedTexts.map((expectedText) => ({ expectedText, matched: false })),
        error: '未找到可用于 OCR 的本地图片素材',
        createdAt: timestamp,
        updatedAt: timestamp,
      }
    }

    try {
      const result = await callOcrSidecar(asset)
      const checks = checksFor(expectedTexts, result.regions)
      return {
        status: checks.every((check) => check.matched) ? 'passed' : 'needs_review',
        expectedTexts,
        regions: result.regions,
        checks,
        sourceWidth: result.sourceWidth,
        sourceHeight: result.sourceHeight,
        scale: result.scale,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
    } catch (err) {
      return {
        status: 'unavailable',
        expectedTexts,
        regions: [],
        checks: expectedTexts.map((expectedText) => ({ expectedText, matched: false })),
        error: err instanceof Error ? err.message : 'OCR 服务不可用',
        createdAt: timestamp,
        updatedAt: timestamp,
      }
    }
  }
}

export const textValidationService = new TextValidationService()
