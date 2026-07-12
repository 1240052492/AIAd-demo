import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { env } from '../config'

/**
 * 取得本地存储根目录（基于进程 cwd 与配置的 localStorageDir 解析）。
 * 该目录同时被 Express 静态资源中间件 /storage 托管，因此保存后可直接通过 /storage/<filename> 访问。
 */
export function getStorageDir(): string {
  return path.resolve(process.cwd(), env.localStorageDir)
}

/**
 * 将 Buffer 写入本地磁盘，返回可直接访问的 URL 与文件名。
 * @param buffer 文件内容
 * @param ext 文件扩展名（不含点），如 png / jpeg
 */
export async function saveBuffer(
  buffer: Buffer,
  ext: 'png' | 'jpeg' | 'jpg' | 'webp' = 'png',
): Promise<{ filename: string; fullPath: string; url: string }> {
  const dir = getStorageDir()
  await mkdir(dir, { recursive: true })
  const safeExt = ext === 'jpg' ? 'jpeg' : ext
  const filename = `${uuid()}.${safeExt}`
  const fullPath = path.join(dir, filename)
  await writeFile(fullPath, buffer)
  return { filename, fullPath, url: `/storage/${filename}` }
}
