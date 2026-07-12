import sharp from 'sharp'
import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import { env } from '../config'

export interface SavedFileMeta {
  storageKey: string
  url: string
  width?: number
  height?: number
  size: number
  mimeType: string
}

const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.svg', '.pdf']

function mimeFromExt(ext: string): string {
  switch (ext) {
    case '.svg':
      return 'image/svg+xml'
    case '.pdf':
      return 'application/pdf'
    case '.webp':
      return 'image/webp'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    default:
      return 'application/octet-stream'
  }
}

/**
 * 本地文件存储工具。
 * 存储根目录为 env.localStorageDir（由 app.ts 以 /storage 静态路径对外提供）。
 */
export class FileStorage {
  /** 保存上传文件：生成 UUID + 原扩展名，写入 localStorageDir/dir/，并尝试用 sharp 读取图片尺寸 */
  static async save(
    file: Buffer,
    originalName: string,
    dir: string,
  ): Promise<SavedFileMeta> {
    const ext = path.extname(originalName).toLowerCase()
    if (!ALLOWED_EXT.includes(ext)) {
      throw new Error(`不支持的文件类型: ${ext || '未知'}`)
    }

    const id = crypto.randomUUID()
    const filename = `${id}${ext}`
    const storageKey = path.posix.join(dir, filename)
    const absDir = path.join(env.localStorageDir, dir)
    await fs.mkdir(absDir, { recursive: true })
    const absPath = path.join(absDir, filename)
    await fs.writeFile(absPath, file)

    let width: number | undefined
    let height: number | undefined
    if (ext !== '.svg' && ext !== '.pdf') {
      try {
        const meta = await sharp(file).metadata()
        width = meta.width
        height = meta.height
      } catch {
        // 非图片或读取失败，忽略尺寸
      }
    }

    return {
      storageKey,
      url: FileStorage.getUrl(storageKey),
      width,
      height,
      size: file.length,
      mimeType: mimeFromExt(ext),
    }
  }

  /** 生成缩放缩略图（等比，最长边 maxSize，不放大） */
  static async thumbnail(file: Buffer, maxSize = 512): Promise<Buffer> {
    return sharp(file)
      .resize(maxSize, maxSize, { fit: 'inside', withoutEnlargement: true })
      .toBuffer()
  }

  /** 删除文件（忽略不存在等错误） */
  static async delete(storageKey: string): Promise<void> {
    try {
      await fs.unlink(path.join(env.localStorageDir, storageKey))
    } catch {
      // 文件不存在时忽略
    }
  }

  /** 由 storageKey 得到对外访问 URL */
  static getUrl(storageKey: string): string {
    return `/storage/${storageKey.replace(/\\/g, '/')}`
  }
}
