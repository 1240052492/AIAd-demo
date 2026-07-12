import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'
import { FileStorage } from '../src/utils/file'

/**
 * 提示词模板批量导入工具
 * 读取 prompt 模版库数据（data.full.json，含 category / promptText / title / imageUrl）
 * 转换并导入数据库。按 title + category 去重。
 *
 * 用法:
 *   tsx scripts/import-templates.ts [数据文件路径] [--no-download]
 *
 * 默认数据源: C:\Users\Administrator\Documents\guanggaohangye\prompt模版库数据\data.full.json
 */

const DEFAULT_DATA_PATH =
  'C:/Users/Administrator/Documents/guanggaohangye/prompt模版库数据/data.full.json'

// 分类 -> businessType 映射
const BUSINESS_TYPE_MAP: Record<string, string> = {
  门头招牌: 'storefront_sign',
  文化墙: 'culture_wall',
  LOGO: 'brand_vi',
  海报: 'ad_material',
  餐饮海报: 'ad_material',
  美陈: 'meichen',
  标识牌: 'signage',
  品牌物料: 'brand_vi',
  图形设计: 'graphic_design',
  展板: 'exhibition_board',
  节日海报: 'ad_material',
  PROMPT复制: 'ad_material',
}

interface SourceItem {
  title: string
  category: string
  promptText?: string
  imageUrl?: string
  localImagePath?: string
}

async function downloadImage(url: string, originalName: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return buf
  } catch {
    return null
  }
}

async function main() {
  const args = process.argv.slice(2)
  const dataPath = args.find((a) => !a.startsWith('--')) || DEFAULT_DATA_PATH
  const noDownload = args.includes('--no-download')

  if (!fs.existsSync(dataPath)) {
    console.error(`❌ 数据源文件不存在: ${dataPath}`)
    process.exit(1)
  }

  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
  const items: SourceItem[] = Array.isArray(raw) ? raw : raw.items || []
  if (!items.length) {
    console.error('❌ 数据源中没有可导入的条目')
    process.exit(1)
  }

  console.log(`📥 读取到 ${items.length} 条数据，开始导入...`)

  const prisma = new PrismaClient()
  let created = 0
  let skipped = 0
  let coverLinked = 0

  for (const item of items) {
    const title = (item.title || '').trim()
    const category = (item.category || '').trim()
    if (!title || !category) {
      skipped++
      continue
    }
    const prompt = (item.promptText || title).trim()

    const existed = await prisma.template.findFirst({
      where: { title, category },
      select: { id: true },
    })
    if (existed) {
      skipped++
      continue
    }

    const template = await prisma.template.create({
      data: {
        title,
        category,
        businessType: BUSINESS_TYPE_MAP[category] || 'ad_material',
        prompt,
        isPublic: true,
      },
    })
    created++

    // 尝试下载封面图并关联到 Asset
    if (!noDownload && (item.imageUrl || item.localImagePath)) {
      let buf: Buffer | null = null
      let originalName = `${title}.jpg`
      if (item.localImagePath && fs.existsSync(item.localImagePath)) {
        buf = fs.readFileSync(item.localImagePath)
      } else if (item.imageUrl) {
        buf = await downloadImage(item.imageUrl, originalName)
      }
      if (buf) {
        try {
          const saved = await FileStorage.save(buf, originalName, 'templates')
          const asset = await prisma.asset.create({
            data: {
              type: 'upload_environment',
              storageKey: saved.storageKey,
              url: saved.url,
              mimeType: saved.mimeType,
              width: saved.width ?? null,
              height: saved.height ?? null,
              size: saved.size,
            } as any,
          })
          await prisma.template.update({
            where: { id: template.id },
            data: { coverAssetId: asset.id },
          })
          coverLinked++
        } catch (e) {
          // 封面关联失败不影响模板创建
        }
      }
    }
  }

  console.log(`✅ 导入完成：新建 ${created} 个，跳过(已存在/无效) ${skipped} 个，关联封面 ${coverLinked} 个`)
  await prisma.$disconnect()
  // 强制退出，避免 config 中 BullMQ 队列连接使进程挂起
  process.exit(0)
}

main().catch((e) => {
  console.error('❌ 导入失败:', e)
  process.exit(1)
})
