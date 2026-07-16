import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { membershipService } from '../services/membership.service'
import { ok, fail } from '../utils/response'

const router = Router()

// 公开：积分超市展示启用中的套餐
router.get('/plans', async (_req: Request, res: Response) => {
  const plans = await membershipService.listPlans(true)
  return ok(res, plans)
})

// 以下均需登录
router.use(authMiddleware)

// 当前用户的有效会员
router.get('/mine', async (req: Request, res: Response) => {
  const list = await membershipService.getUserMemberships(req.user!.id)
  return ok(res, list)
})

router.get('/benefits', async (req: Request, res: Response) => {
  return ok(res, await membershipService.getEffectiveBenefits(req.user!.id))
})

// 未接支付网关前禁止直接发放套餐积分，避免普通用户免费刷积分。
router.post('/purchase', async (_req: Request, res: Response) => {
  return fail(res, 403, '会员购买尚未开放，请联系管理员')
})

export { router as membershipRoutes }
