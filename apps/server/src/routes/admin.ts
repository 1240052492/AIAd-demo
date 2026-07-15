import { Router, Request, Response } from 'express'
import { asyncHandler } from '../utils/async-handler'
import { sendSuccess, sendPaginated } from '../utils/response'
import { requireAdmin, AuthRequest } from '../middleware/auth'
import { adminService } from '../services/admin.service'
import { templateService } from '../services/template.service'
import { systemSettingService } from '../services/system-setting.service'
import { prisma } from '../config'
import { parsePagination, toPaginated } from '../utils/pagination'
import { NotFoundError, ValidationError } from '../utils/errors'
import { adjustCreditsSchema } from '../utils/validation'
import { membershipService } from '../services/membership.service'
import { rechargeService } from '../services/recharge.service'
import { roleConfigService } from '../services/role-config.service'

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
  // 系统布局相关（真实联动）
  industries: ['餐饮', '零售', '教育', '医疗', '地产', '美业'],
  recommendedTemplates: [] as string[],
  announcement: '',
}

/**
 * 系统设置可写字段白名单：PUT /settings 仅接受下列字段，其余一律忽略，
 * 防止通过整体合并写入任意脏字段。
 */
export const SETTINGS_WRITABLE_FIELDS = [
  'siteName',
  'allowGuestBrowse',
  'maintenanceMode',
  'maxUploadMb',
  'industries',
  'recommendedTemplates',
  'announcement',
]

/** 积分规则可写字段白名单：仅接受下列非负数值字段 */
export const CREDIT_RULE_FIELDS = [
  'registerBonus',
  'imageGeneration',
  'composition',
  'exportPng',
  'exportPdf',
  'exportSvg',
]

// ===== 数据总览 =====
// GET /api/admin/overview
router.get(
  '/overview',
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const overview = await adminService.getOverview()
    sendSuccess(res, overview)
  }),
)

// GET /api/admin/overview/details?type=generations|activeUsers|credits|failedJobs
router.get(
  '/overview/details',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const type = req.query.type as string
    const page = req.query.page ? Number(req.query.page) : undefined
    const pageSize = req.query.pageSize ? Number(req.query.pageSize) : undefined
    if (!type) throw new ValidationError('type 参数必填')
    const result = await adminService.getOverviewDetails(type as any, { page, pageSize })
    sendPaginated(res, result)
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

// POST /api/admin/users  —— 管理员创建用户
router.post(
  '/users',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { phone, email, nickname, password, roleCode, initialCredits } = req.body ?? {}
    const user = await adminService.createUser({
      phone,
      email,
      nickname,
      password,
      roleCode,
      initialCredits: initialCredits === undefined ? undefined : Number(initialCredits),
    })
    sendSuccess(res, user, '用户创建成功')
  }),
)

// PATCH /api/admin/users/:id  —— 编辑用户基础信息 / 密码 / 状态
router.patch(
  '/users/:id',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    // 自我保护：禁止管理员通过此接口修改自身状态导致锁死（其它字段仍可）
    if (req.params.id === req.user!.id && req.body?.status && req.body.status !== 'active') {
      throw new ValidationError('不能禁用 / 封禁自己的账号')
    }
    const { phone, email, nickname, password, status } = req.body ?? {}
    const user = await adminService.updateUser(req.params.id, {
      phone,
      email,
      nickname,
      password,
      status,
    })
    sendSuccess(res, user, '用户信息已更新')
  }),
)

// DELETE /api/admin/users/:id  —— 删除用户（禁删自己）
router.delete(
  '/users/:id',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (req.params.id === req.user!.id) {
      throw new ValidationError('不能删除自己的账号')
    }
    const result = await adminService.deleteUser(req.params.id)
    sendSuccess(res, result, '用户已删除')
  }),
)

// PATCH /api/admin/users/:id/status
router.patch(
  '/users/:id/status',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    // 自我保护：禁止管理员操作自身，避免把自己禁用 / 封禁导致锁死
    if (req.params.id === req.user!.id) {
      throw new ValidationError('不能修改自己的账号状态')
    }
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
    const parsed = adjustCreditsSchema.safeParse(req.body)
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message || '参数错误')
    }
    const { amount, reason } = parsed.data
    const result = await adminService.adjustCredits(
      req.params.id,
      req.user!.id,
      amount,
      reason,
    )
    sendSuccess(res, result, '积分调整成功')
  }),
)

// ===== 积分规则 =====
// GET /api/admin/credit-rules
router.get(
  '/credit-rules',
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const rules = await systemSettingService.get('creditRules', DEFAULT_CREDIT_RULES)
    // 合并默认值兜底：若库中该键缺失或字段不全（如曾被写成空对象），仍返回完整默认项。
    sendSuccess(res, { ...DEFAULT_CREDIT_RULES, ...rules })
  }),
)

// PUT /api/admin/credit-rules
router.put(
  '/credit-rules',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const current = await systemSettingService.get('creditRules', DEFAULT_CREDIT_RULES)
    // 仅接受白名单字段，且必须为非负有限数字；其余忽略。
    const merged: Record<string, number> = { ...current }
    for (const key of CREDIT_RULE_FIELDS) {
      if (req.body?.[key] === undefined) continue
      const v = Number(req.body[key])
      if (!Number.isFinite(v) || v < 0) {
        throw new ValidationError(`积分规则字段 ${key} 必须为非负数字`)
      }
      merged[key] = Math.floor(v)
    }
    await systemSettingService.set('creditRules', merged)
    sendSuccess(res, merged, '积分规则已更新')
  }),
)

// GET /api/admin/credit-transactions - 管理员积分流水
router.get(
  '/credit-transactions',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await adminService.listCreditTransactions({
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      type: req.query.type as string | undefined,
      search: req.query.search as string | undefined,
    })
    sendPaginated(res, result)
  }),
)

// ===== 角色权限配置（服务端强制生效） =====
// GET /api/admin/role-configs
router.get(
  '/role-configs',
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const list = await roleConfigService.getAll()
    sendSuccess(res, list)
  }),
)

// PUT /api/admin/role-configs/:roleCode
router.put(
  '/role-configs/:roleCode',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { rate, permissions } = req.body ?? {}
    if (rate !== undefined && (typeof rate !== 'number' || rate <= 0 || rate > 5)) {
      throw new ValidationError('倍率必须为 0 < rate <= 5 的数字')
    }
    const updated = await roleConfigService.upsert(req.params.roleCode, { rate, permissions })
    sendSuccess(res, updated, '角色配置已更新')
  }),
)

// ===== 会员套餐管理 =====
// GET /api/admin/membership-plans
router.get(
  '/membership-plans',
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const plans = await membershipService.listPlans()
    sendSuccess(res, plans)
  }),
)

// POST /api/admin/membership-plans
router.post(
  '/membership-plans',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const plan = await membershipService.upsertPlan(req.body)
    sendSuccess(res, plan, '套餐创建成功')
  }),
)

// PUT /api/admin/membership-plans/:id
router.put(
  '/membership-plans/:id',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const plan = await membershipService.upsertPlan({ ...req.body, id: req.params.id })
    sendSuccess(res, plan, '套餐更新成功')
  }),
)

// DELETE /api/admin/membership-plans/:id
router.delete(
  '/membership-plans/:id',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    await membershipService.deletePlan(req.params.id)
    sendSuccess(res, null, '套餐已删除')
  }),
)

// ===== 充值管理 =====
// GET /api/admin/recharges
router.get(
  '/recharges',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await rechargeService.listAll({
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      status: req.query.status as string | undefined,
    })
    sendPaginated(res, toPaginated(result.items, result.total, result.page, result.pageSize))
  }),
)

// ===== 用户角色配置（权限生效关键点） =====
// PUT /api/admin/users/:id/roles  { roleCodes: string[] }
router.put(
  '/users/:id/roles',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    // 自我保护：禁止管理员修改自身角色，避免误降权导致无法管理
    if (req.params.id === req.user!.id) {
      throw new ValidationError('不能修改自己的角色')
    }
    const { roleCodes } = req.body ?? {}
    if (!Array.isArray(roleCodes)) throw new ValidationError('roleCodes 必须为数组')
    if (roleCodes.length > 1) throw new ValidationError('每个用户仅允许分配一个角色')
    const valid = await prisma.role.findMany({ where: { code: { in: roleCodes } } })
    if (valid.length !== roleCodes.length) throw new ValidationError('存在非法的角色编码')
    await prisma.userRole.deleteMany({ where: { userId: req.params.id } })
    if (roleCodes.length) {
      await prisma.userRole.createMany({
        data: roleCodes.map((code: string) => ({
          userId: req.params.id,
          roleId: valid.find((r) => r.code === code)!.id,
        })),
      })
    }
    sendSuccess(res, { roleCodes }, '用户角色已更新（重新登录后生效）')
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

// POST /api/admin/provider-configs （创建供应商配置；敏感 key 仍禁止写入数据库）
router.post(
  '/provider-configs',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const provider = String(req.body?.provider || '').trim()
    const displayName = String(req.body?.displayName || provider).trim()
    if (!provider) throw new ValidationError('provider 不能为空')
    if (!displayName) throw new ValidationError('显示名称不能为空')
    const existing = await prisma.aiProviderConfig.findFirst({ where: { provider } })
    if (existing) throw new ValidationError(`供应商 ${provider} 已存在，请直接编辑现有配置`)
    const cfg = await prisma.aiProviderConfig.create({
      data: {
        provider,
        displayName,
        baseUrl: String(req.body?.baseUrl || '').trim(),
        model: String(req.body?.model || '').trim(),
        enabled: req.body?.enabled !== false,
        priority: Number.isFinite(Number(req.body?.priority)) ? Number(req.body.priority) : 0,
        configJson: req.body?.configJson ?? undefined,
      },
    })
    sendSuccess(res, cfg, 'Provider 配置已创建')
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

// DELETE /api/admin/provider-configs/:id
router.delete(
  '/provider-configs/:id',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const existing = await prisma.aiProviderConfig.findUnique({ where: { id: req.params.id } })
    if (!existing) throw new NotFoundError('Provider 配置不存在')
    await prisma.aiProviderConfig.delete({ where: { id: req.params.id } })
    sendSuccess(res, { id: req.params.id }, 'Provider 配置已删除')
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

// POST /api/admin/generation-jobs/:id/pause
router.post(
  '/generation-jobs/:id/pause',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const job = await adminService.pauseJob(req.params.id)
    sendSuccess(res, job, '任务已暂停')
  }),
)

// POST /api/admin/generation-jobs/:id/refund
router.post(
  '/generation-jobs/:id/refund',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const job = await adminService.refundJob(req.params.id, req.user!.id)
    sendSuccess(res, job, '任务已取消，积分已退还')
  }),
)

// ===== 系统配置 =====
// GET /api/admin/settings
router.get(
  '/settings',
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const settings = await systemSettingService.get('siteSettings', DEFAULT_SETTINGS)
    // 合并默认值兜底：库中缺失的字段（如新增的 industries/announcement）回退到默认。
    sendSuccess(res, { ...DEFAULT_SETTINGS, ...settings })
  }),
)

// PUT /api/admin/settings
router.put(
  '/settings',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const current = await systemSettingService.get('siteSettings', DEFAULT_SETTINGS)
    // 仅接受白名单字段，其余忽略，防止写入任意脏字段。
    const picked: Record<string, unknown> = {}
    for (const key of SETTINGS_WRITABLE_FIELDS) {
      if (req.body?.[key] !== undefined) picked[key] = req.body[key]
    }
    const merged = { ...current, ...picked }
    await systemSettingService.set('siteSettings', merged)
    sendSuccess(res, merged, '系统设置已更新')
  }),
)

export const adminRoutes = router
