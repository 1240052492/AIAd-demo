import { Router, Request, Response } from 'express'
import multer from 'multer'
import { asyncHandler } from '../utils/async-handler'
import { sendSuccess, sendPaginated } from '../utils/response'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { ValidationError } from '../utils/errors'
import { projectService } from '../services/project.service'

const router = Router()

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 20 * 1024 * 1024 }, // 单文件最大 20MB
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpe?g|png|webp|svg|pdf)$/i
    if (allowed.test(file.originalname)) cb(null, true)
    else cb(new ValidationError('仅允许上传 jpg/png/webp/svg/pdf 文件'))
  },
})

// GET /api/projects - 项目列表
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await projectService.list(req.user!.id, {
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      businessType: req.query.businessType as string | undefined,
      status: req.query.status as string | undefined,
    })
    sendPaginated(res, result)
  }),
)

// POST /api/projects - 创建项目
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const project = await projectService.create(req.user!.id, {
      title: req.body.title,
      businessType: req.body.businessType,
      briefJson: req.body.briefJson,
    })
    sendSuccess(res, project, '项目创建成功')
  }),
)

// GET /api/projects/:id - 项目详情
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const project = await projectService.detail(req.params.id, req.user!.id)
    sendSuccess(res, project)
  }),
)

// PATCH /api/projects/:id - 更新项目
router.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const project = await projectService.update(req.params.id, req.user!.id, req.body)
    sendSuccess(res, project, '项目更新成功')
  }),
)

// POST /api/projects/:id/assets - 上传素材
router.post(
  '/:id/assets',
  requireAuth,
  upload.single('file'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.file) throw new ValidationError('未接收到上传文件')
    const type = (req.body.type as string) || 'upload_environment'
    const asset = await projectService.uploadAsset(
      req.params.id,
      req.user!.id,
      req.file,
      type,
    )
    sendSuccess(res, asset, '素材上传成功')
  }),
)

// GET /api/projects/:id/assets - 素材列表
router.get(
  '/:id/assets',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const assets = await projectService.getAssets(req.params.id)
    sendSuccess(res, assets)
  }),
)

// POST /api/projects/:id/versions - 保存画布版本
router.post(
  '/:id/versions',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const version = await projectService.saveVersion(
      req.params.id,
      req.body.canvasJson || {},
      req.body.name,
    )
    sendSuccess(res, version, '版本保存成功')
  }),
)

// POST /api/projects/:id/export - 导出项目
router.post(
  '/:id/export',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const format = req.body.format
    if (!['png', 'svg', 'pdf'].includes(format)) {
      throw new ValidationError('导出格式仅支持 png / svg / pdf')
    }
    const result = await projectService.exportProject(req.params.id, format)
    sendSuccess(res, result, '导出成功')
  }),
)

// DELETE /api/projects/:id - 删除项目
router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    await projectService.delete(req.params.id, req.user!.id)
    sendSuccess(res, null, '项目已删除')
  }),
)

export const projectRoutes = router
