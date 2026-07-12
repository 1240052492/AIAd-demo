import { Router, Request, Response } from 'express'
import { asyncHandler } from '../utils/async-handler'
import { sendSuccess, sendPaginated } from '../utils/response'
import { requireAdmin, AuthRequest } from '../middleware/auth'
import { adminService } from '../services/admin.service'
import { templateService } from '../services/template.service'
import { JsonStore } from '../utils/json-store'
import { prisma } from '../config'
import { parsePagination, toPaginated } from '../utils/pagination'
import { NotFoundError, ValidationError } from '../utils/errors'

const router = Router()

// 所有 Admin 路由均需管理员权限
router.use(requireAdmin)

export const DEFAULT_CREDIT_RULES = {
  registerBonus: 5,
  imageGeneration: 2,
  composition: 1,
  exportPng: 1,
  exportPdf: 2,
  exportSvg: 1,
}

export const DEFAULT_SETTINGS = {
  siteName: 'AdCraft AI 广告工作台',
  allowGuestBrowse: true,
  maintenanceMode: false,
  maxUploadMb: 20,
}

// ===== 数据总览 =====
// GET /api/admin/overview
router.get(
  '/overview',
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const overview = await adminService.getOverview()
    sendSuccess(res, overview)
  }),
)

// ===== 用户管理 =====
// GET /api/admin/users
router.get(
  '/users',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await adminService.listUsers({
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      search: req.query.search as string | undefined,
      status: req.query.status as string | undefined,
    })
    sendPaginated(res, result)
  }),
)

// GET /api/admin/users/:id
router.get(
  '/users/:id',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = await adminService.getUserDetail(req.params.id)
    sendSuccess(res, user)
  }),
)

// PATCH /api/admin/users/:id/status
router.patch(
  '/users/:id/status',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { status } = req.body
    if (!['active', 'disabled', 'banned'].includes(status)) {
      throw new ValidationError('非法的用户状态')
    }
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { status },
    })
    sendSuccess(res, user, '用户状态已更新')
  }),
)

// POST /api/admin/users/:id/credits/adjust
router.post(
  '/users/:id/credits/adjust',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const amount = Number(req.body.amount)
    const result = await adminService.adjustCredits(
      req.params.id,
      req.user!.id,
      amount,
      req.body.reason,
    )
    sendSuccess(res, result, '积分调整成功')
  }),
)

// ===== 积分规则 =====
// GET /api/admin/credit-rules
router.get(
  '/credit-rules',
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const rules = await JsonStore.read('credit-rules', DEFAULT_CREDIT_RULES)
    sendSuccess(res, rules)
  }),
)

// PUT /api/admin/credit-rules
router.put(
  '/credit-rules',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    // 原子更新：在文件锁内完成「读取 → 合并 → 写回」，避免并发丢失更新
    const saved = await JsonStore.update('credit-rules', DEFAULT_CREDIT_RULES, (current) => ({
      ...current,
      ...req.body,
    }))
    sendSuccess(res, saved, '积分规则已更新')
  }),
)

// ===== 模板管理 =====
// GET /api/admin/templates （全部，含非公开）
router.get(
  '/templates',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await templateService.list({
      isPublic:
        req.query.isPublic === undefined
          ? undefined
          : req.query.isPublic === 'true',
      category: req.query.category as string | undefined,
      businessType: req.query.businessType as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    })
    sendPaginated(res, result)
  }),
)

// POST /api/admin/templates
router.post(
  '/templates',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const template = await templateService.create(req.body)
    sendSuccess(res, template, '模板创建成功')
  }),
)

// PATCH /api/admin/templates/:id
router.patch(
  '/templates/:id',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const template = await templateService.update(req.params.id, req.body)
    sendSuccess(res, template, '模板更新成功')
  }),
)

// DELETE /api/admin/templates/:id
router.delete(
  '/templates/:id',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    await templateService.delete(req.params.id)
    sendSuccess(res, null, '模板已删除')
  }),
)

// ===== 工作流配置 =====
// GET /api/admin/workflows
  router.get(
  '/workflows',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { page, pageSize, skip, take } = parsePagination(req.query as any)
    const where: any = {}
    if (req.query.businessType) where.businessType = req.query.businessType
    const [total, items] = await prisma.$transaction([
      prisma.workflowTemplate.count({ where }),
      prisma.workflowTemplate.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    ])
    sendPaginated(res, toPaginated(items, total, page, pageSize))
  }),
)

// POST /api/admin/workflows
router.post(
  '/workflows',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.body.title?.trim()) throw new ValidationError('工作流标题不能为空')
    const wf = await prisma.workflowTemplate.create({
      data: {
        title: req.body.title.trim(),
        businessType: req.body.businessType || 'ad_material',
        description: req.body.description || null,
        stepsJson: (req.body.stepsJson ?? []) as any,
        creditRuleJson: req.body.creditRuleJson ?? null,
        isPublic: req.body.isPublic ?? true,
      },
    })
    sendSuccess(res, wf, '工作流创建成功')
  }),
)

// PATCH /api/admin/workflows/:id
router.patch(
  '/workflows/:id',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const existing = await prisma.workflowTemplate.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    })
    if (!existing) throw new NotFoundError('工作流不存在')
    const updatable: any = {}
    if (req.body.title !== undefined) updatable.title = String(req.body.title).trim()
    if (req.body.businessType !== undefined) updatable.businessType = req.body.businessType
    if (req.body.description !== undefined) updatable.description = req.body.description
    if (req.body.stepsJson !== undefined) updatable.stepsJson = req.body.stepsJson
    if (req.body.creditRuleJson !== undefined) updatable.creditRuleJson = req.body.creditRuleJson
    if (req.body.isPublic !== undefined) updatable.isPublic = req.body.isPublic
    const wf = await prisma.workflowTemplate.update({ where: { id: req.params.id }, data: updatable })
    sendSuccess(res, wf, '工作流更新成功')
  }),
)

// DELETE /api/admin/workflows/:id
router.delete(
  '/workflows/:id',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const existing = await prisma.workflowTemplate.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    })
    if (!existing) throw new NotFoundError('工作流不存在')
    await prisma.workflowTemplate.delete({ where: { id: req.params.id } })
    sendSuccess(res, null, '工作流已删除')
  }),
)

// ===== Provider 配置 =====
// GET /api/admin/provider-configs （不含敏感 key）
router.get(
  '/provider-configs',
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const configs = await prisma.aiProviderConfig.findMany({
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        provider: true,
        displayName: true,
        baseUrl: true,
        model: true,
        enabled: true,
        priority: true,
        configJson: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    sendSuccess(res, configs)
  }),
)

// PATCH /api/admin/provider-configs/:id
router.patch(
  '/provider-configs/:id',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const existing = await prisma.aiProviderConfig.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    })
    if (!existing) throw new NotFoundError('Provider 配置不存在')
    const updatable: any = {}
    if (req.body.enabled !== undefined) updatable.enabled = !!req.body.enabled
    if (req.body.priority !== undefined) updatable.priority = Number(req.body.priority)
    if (req.body.displayName !== undefined) updatable.displayName = req.body.displayName
    if (req.body.baseUrl !== undefined) updatable.baseUrl = req.body.baseUrl
    if (req.body.model !== undefined) updatable.model = req.body.model
    if (req.body.configJson !== undefined) updatable.configJson = req.body.configJson
    const cfg = await prisma.aiProviderConfig.update({
      where: { id: req.params.id },
      data: updatable,
    })
    sendSuccess(res, cfg, 'Provider 配置已更新')
  }),
)

// ===== 任务队列 =====
// GET /api/admin/generation-jobs
router.get(
  '/generation-jobs',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await adminService.listJobs({
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      status: req.query.status as string | undefined,
      jobType: req.query.jobType as string | undefined,
    })
    sendPaginated(res, result)
  }),
)

// GET /api/admin/generation-jobs/:id
router.get(
  '/generation-jobs/:id',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const job = await adminService.getJobDetail(req.params.id)
    sendSuccess(res, job)
  }),
)

// POST /api/admin/generation-jobs/:id/retry
router.post(
  '/generation-jobs/:id/retry',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const job = await adminService.retryJob(req.params.id)
    sendSuccess(res, job, '任务已重新入队')
  }),
)

// ===== 系统配置 =====
// GET /api/admin/settings
router.get(
  '/settings',
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const settings = await JsonStore.read('settings', DEFAULT_SETTINGS)
    sendSuccess(res, settings)
  }),
)

// PUT /api/admin/settings
router.put(
  '/settings',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    // 原子更新：在文件锁内完成「读取 → 合并 → 写回」，避免并发丢失更新
    const saved = await JsonStore.update('settings', DEFAULT_SETTINGS, (current) => ({
      ...current,
      ...req.body,
    }))
    sendSuccess(res, saved, '系统设置已更新')
  }),
)

export const adminRoutes = router
