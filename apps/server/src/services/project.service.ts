import path from 'path'
import fs from 'fs/promises'
import sharp from 'sharp'
import { prisma } from '../config'
import { FileStorage } from '../utils/file'
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors'
import { AssetType, PaginatedResponse } from '../types/common'
import { parsePagination, toPaginated } from '../utils/pagination'

export interface CreateProjectInput {
  title: string
  businessType: string
  briefJson?: object
}

export interface ListProjectParams {
  page?: number
  pageSize?: number
  businessType?: string
  status?: string
}

export class ProjectService {
  /** 创建项目 */
  async create(userId: string, data: CreateProjectInput) {
    if (!data.title || !data.title.trim()) {
      throw new ValidationError('项目标题不能为空')
    }
    if (!data.businessType) {
      throw new ValidationError('业务类型不能为空')
    }
    return prisma.project.create({
      data: {
        userId,
        title: data.title.trim(),
        businessType: data.businessType,
        briefJson: (data.briefJson ?? null) as any,
        status: 'draft',
      },
    })
  }

  /** 获取项目列表（分页，仅当前用户） */
  async list(
    userId: string,
    params: ListProjectParams,
  ): Promise<PaginatedResponse<any>> {
    const { page, pageSize, skip, take } = parsePagination(params as any)
    const where: any = { userId }
    if (params.businessType) where.businessType = params.businessType
    if (params.status) where.status = params.status

    const [total, items] = await prisma.$transaction([
      prisma.project.count({ where }),
      prisma.project.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
      }),
    ])
    return toPaginated(items, total, page, pageSize)
  }

  /** 获取项目详情（含 versions 和 assets），校验归属 */
  async detail(id: string, userId: string) {
    const project = await prisma.project.findFirst({
      where: { id, userId },
      include: {
        versions: { orderBy: { createdAt: 'desc' } },
        // 详情页只取最近 20 个素材做预览，避免大项目一次性加载全部素材
        // （完整列表走独立的 GET /api/projects/:id/assets 分页接口）。
        assets: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    })
    if (!project) {
      throw new NotFoundError('项目不存在或无权访问')
    }
    return project
  }

  /** 合法的项目状态枚举（与 schema.prisma 注释保持一致） */
  static readonly PROJECT_STATUSES = ['draft', 'generating', 'editing', 'completed', 'exported'] as const

  /** 更新项目，校验归属 */
  async update(id: string, userId: string, data: Partial<any>) {
    await this.assertOwner(id, userId)
    const updatable: any = {}
    if (data.title !== undefined) {
      if (!String(data.title).trim()) throw new ValidationError('项目标题不能为空')
      updatable.title = String(data.title).trim()
    }
    if (data.businessType !== undefined) updatable.businessType = data.businessType
    if (data.briefJson !== undefined) updatable.briefJson = data.briefJson
    if (data.status !== undefined) {
      if (!ProjectService.PROJECT_STATUSES.includes(data.status)) {
        throw new ValidationError(`非法的项目状态：${data.status}`)
      }
      updatable.status = data.status
    }

    return prisma.project.update({ where: { id }, data: updatable })
  }

  /** 上传项目素材：生成缩略图 + 落盘 + 写入 Asset 记录 */
  async uploadAsset(
    projectId: string,
    userId: string,
    file: Express.Multer.File,
    type: AssetType,
  ) {
    await this.assertOwner(projectId, userId)

    // multer 使用 memoryStorage，file.buffer 必为 Buffer；这里再做一道防御性校验，
    // 避免空内容/超大文件导致落盘或 sharp 处理时崩溃。
    if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
      throw new ValidationError('上传文件内容为空')
    }
    if (file.size > 20 * 1024 * 1024) {
      throw new ValidationError('上传文件过大，最大 20MB')
    }

    const saved = await FileStorage.save(file.buffer, file.originalname, 'assets')

    let thumbStorageKey: string | undefined
    const isImage =
      saved.mimeType.startsWith('image/') && saved.mimeType !== 'image/svg+xml'
    if (isImage) {
      try {
        const thumb = await FileStorage.thumbnail(file.buffer)
        const thumbMeta = await FileStorage.save(
          thumb,
          `thumb-${file.originalname}`,
          'thumbs',
        )
        thumbStorageKey = thumbMeta.storageKey
      } catch {
        // 缩略图生成失败不影响主文件
      }
    }

    return prisma.asset.create({
      data: {
        userId,
        projectId,
        type,
        storageKey: saved.storageKey,
        url: saved.url,
        mimeType: saved.mimeType,
        width: saved.width ?? null,
        height: saved.height ?? null,
        size: saved.size,
        metadataJson: thumbStorageKey ? { thumbnail: thumbStorageKey } : undefined,
      } as any,
    })
  }

  /** 获取项目素材列表（分页，校验归属） */
  async getAssets(
    projectId: string,
    userId: string,
    params?: { page?: number; pageSize?: number },
  ): Promise<PaginatedResponse<any>> {
    await this.assertOwner(projectId, userId)
    const { page, pageSize, skip, take } = parsePagination((params ?? {}) as any)
    const where = { projectId }
    const [total, items] = await prisma.$transaction([
      prisma.asset.count({ where }),
      prisma.asset.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ])
    return toPaginated(items, total, page, pageSize)
  }

  /** 获取项目任务历史（仅当前用户，最近 100 条） */
  async getJobs(projectId: string, userId: string) {
    await this.assertOwner(projectId, userId)
    return prisma.generationJob.findMany({
      where: { projectId, userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
  }

  /** 保存画布版本（校验归属；限制画布体积防 JSON DoS） */
  async saveVersion(
    projectId: string,
    userId: string,
    canvasJson: object,
    name?: string,
  ) {
    await this.assertOwner(projectId, userId)
    // 防御：画布 JSON 序列化后限长 1MB，避免超大负载直接写入 DB
    let serialized: string
    try {
      serialized = JSON.stringify(canvasJson ?? {})
    } catch {
      throw new ValidationError('画布数据无法序列化')
    }
    if (serialized.length > 1_000_000) {
      throw new ValidationError('画布数据过大，最大 1MB')
    }

    const version = await prisma.projectVersion.create({
      data: {
        projectId,
        name: name && name.trim() ? name.trim() : `版本 ${new Date().toLocaleString('zh-CN')}`,
        canvasJson: (canvasJson ?? {}) as any,
      },
    })
    await prisma.project.update({
      where: { id: projectId },
      data: { currentVersionId: version.id, status: 'editing' },
    })
    return version
  }

  /** 导出项目，返回对应格式文件的 URL（校验归属；占位渲染生成最小可用文件） */
  async exportProject(
    projectId: string,
    userId: string,
    format: 'png' | 'svg' | 'pdf',
  ): Promise<{ url: string }> {
    await this.assertOwner(projectId, userId)
    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) throw new NotFoundError('项目不存在')

    const exportDir = 'exports'
    const filename = `${projectId}-${Date.now()}.${format}`
    const storageKey = path.posix.join(exportDir, filename)
    const absDir = path.join(process.env.LOCAL_STORAGE_DIR || 'storage/uploads', exportDir)
    await fs.mkdir(absDir, { recursive: true })
    const absPath = path.join(absDir, filename)

    let mimeType = 'application/octet-stream'
    let size = 0
    if (format === 'png') {
      await fs.writeFile(
        absPath,
        await sharp({
          create: { width: 1024, height: 1024, channels: 3, background: '#ffffff' },
        })
          .png()
          .toBuffer(),
      )
      mimeType = 'image/png'
    } else if (format === 'svg') {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="100%" height="100%" fill="#ffffff"/><text x="50%" y="50%" font-size="32" text-anchor="middle">${project.title}</text></svg>`
      await fs.writeFile(absPath, svg)
      mimeType = 'image/svg+xml'
    } else {
      // 最小可用 PDF
      const pdf = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 1024 1024]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF`
      await fs.writeFile(absPath, pdf)
      mimeType = 'application/pdf'
    }
    const stat = await fs.stat(absPath)
    size = stat.size

    const url = `/storage/${storageKey.replace(/\\/g, '/')}`
    await prisma.asset.create({
      data: {
        projectId,
        userId: project.userId,
        type: `export_${format}`,
        storageKey,
        url,
        mimeType,
        size,
      } as any,
    })
    return { url }
  }

  /** 删除项目（硬删除，级联删除 versions/assets 关联由数据库约束处理） */
  async delete(id: string, userId: string): Promise<void> {
    await this.assertOwner(id, userId)
    // 清理关联的素材文件
    const assets = await prisma.asset.findMany({ where: { projectId: id } })
    await Promise.all(
      assets.map((a) => FileStorage.delete(a.storageKey).catch(() => {})),
    )
    await prisma.project.delete({ where: { id } })
  }

  /** 校验项目归属，否则抛错 */
  private async assertOwner(id: string, userId: string) {
    const project = await prisma.project.findFirst({ where: { id, userId } })
    if (!project) {
      throw new ForbiddenError('项目不存在或无权操作')
    }
  }
}

export const projectService = new ProjectService()
