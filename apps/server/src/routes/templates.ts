import { Router, Request, Response } from 'express'
import { asyncHandler } from '../utils/async-handler'
import { sendSuccess, sendPaginated } from '../utils/response'
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth'
import { templateService } from '../services/template.service'

const router = Router()

// GET /api/templates - 公开模板列表（允许未登录浏览，带 token 也行）
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await templateService.list({
      isPublic: true,
      category: req.query.category as string | undefined,
      businessType: req.query.businessType as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    })
    sendPaginated(res, result)
  }),
)

// GET /api/templates/:id - 模板详情
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const template = await templateService.detail(req.params.id)
    sendSuccess(res, template)
  }),
)

// POST /api/templates - 创建模板（admin）
router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const template = await templateService.create(req.body)
    sendSuccess(res, template, '模板创建成功')
  }),
)

// PATCH /api/templates/:id - 更新模板（admin）
router.patch(
  '/:id',
  requireAdmin,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const template = await templateService.update(req.params.id, req.body)
    sendSuccess(res, template, '模板更新成功')
  }),
)

// DELETE /api/templates/:id - 删除模板（admin）
router.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    await templateService.delete(req.params.id)
    sendSuccess(res, null, '模板已删除')
  }),
)

export const templateRoutes = router
