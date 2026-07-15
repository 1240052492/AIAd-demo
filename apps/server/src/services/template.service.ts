import { prisma } from '../config'
import { NotFoundError, ValidationError } from '../utils/errors'
import { PaginatedResponse } from '../types/common'
import { parsePagination, toPaginated } from '../utils/pagination'

export interface ListTemplateParams {
  category?: string
  businessType?: string
  page?: number
  pageSize?: number
  isPublic?: boolean
}

export interface CreateTemplateInput {
  title: string
  category: string
  businessType: string
  prompt: string
  configJson?: object
  coverAssetId?: string
  sortOrder?: number
}

export class TemplateService {
  /** 公开模板按业务类型聚合，避免前端只统计当前分页。 */
  async publicStats(): Promise<Record<string, number>> {
    const groups = await prisma.template.groupBy({
      by: ['businessType'],
      where: { isPublic: true },
      _count: { _all: true },
    })
    return Object.fromEntries(groups.map((group) => [group.businessType, group._count._all]))
  }

  /** 获取模板列表（公开模板 + 分类筛选 + 分页） */
  async list(params: ListTemplateParams): Promise<PaginatedResponse<any>> {
    const { page, pageSize, skip, take } = parsePagination(params as any)
    const where: any = {}
    if (params.isPublic !== undefined) where.isPublic = params.isPublic
    if (params.category) where.category = params.category
    if (params.businessType) where.businessType = params.businessType

    const [total, items] = await prisma.$transaction([
      prisma.template.count({ where }),
      prisma.template.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
    ])
    return toPaginated(items, total, page, pageSize)
  }

  /** 获取模板详情 */
  async detail(id: string) {
    const template = await prisma.template.findUnique({
      where: { id },
      include: { coverAsset: true },
    })
    if (!template) throw new NotFoundError('模板不存在')
    return template
  }

  /** 管理员创建模板 */
  async create(data: CreateTemplateInput) {
    if (!data.title?.trim()) throw new ValidationError('模板标题不能为空')
    if (!data.category?.trim()) throw new ValidationError('模板分类不能为空')
    if (!data.businessType?.trim()) throw new ValidationError('业务类型不能为空')
    if (!data.prompt?.trim()) throw new ValidationError('提示词不能为空')

    return prisma.template.create({
      data: {
        title: data.title.trim(),
        category: data.category.trim(),
        businessType: data.businessType.trim(),
        prompt: data.prompt,
        configJson: (data.configJson ?? null) as any,
        coverAssetId: data.coverAssetId ?? null,
        sortOrder: data.sortOrder ?? 0,
        isPublic: true,
      },
    })
  }

  /** 管理员更新模板 */
  async update(id: string, data: Partial<any>) {
    await this.assertExists(id)
    const updatable: any = {}
    if (data.title !== undefined) updatable.title = String(data.title).trim()
    if (data.category !== undefined) updatable.category = String(data.category).trim()
    if (data.businessType !== undefined) updatable.businessType = String(data.businessType)
    if (data.prompt !== undefined) updatable.prompt = String(data.prompt)
    if (data.configJson !== undefined) updatable.configJson = data.configJson
    if (data.coverAssetId !== undefined) updatable.coverAssetId = data.coverAssetId
    if (data.sortOrder !== undefined) updatable.sortOrder = data.sortOrder
    if (data.isPublic !== undefined) updatable.isPublic = data.isPublic

    return prisma.template.update({ where: { id }, data: updatable })
  }

  /** 管理员删除模板 */
  async delete(id: string): Promise<void> {
    await this.assertExists(id)
    await prisma.template.delete({ where: { id } })
  }

  /**
   * 批量导入模板（从 JSON 数据导入提示词模板库）。
   * 按 title + category 去重，已存在则跳过。
   * 返回实际新建的数量。
   */
  async bulkImport(
    templates: Array<{ title: string; category: string; businessType: string; prompt: string }>,
  ): Promise<number> {
    let created = 0
    for (const t of templates) {
      if (!t.title?.trim() || !t.category?.trim()) continue
      const existing = await prisma.template.findFirst({
        where: { title: t.title.trim(), category: t.category.trim() },
        select: { id: true },
      })
      if (existing) continue // 去重跳过
      await prisma.template.create({
        data: {
          title: t.title.trim(),
          category: t.category.trim(),
          businessType: t.businessType?.trim() || 'ad_material',
          prompt: t.prompt?.trim() || t.title.trim(),
          isPublic: true,
        },
      })
      created++
    }
    return created
  }

  private async assertExists(id: string) {
    const t = await prisma.template.findUnique({ where: { id }, select: { id: true } })
    if (!t) throw new NotFoundError('模板不存在')
  }
}

export const templateService = new TemplateService()
