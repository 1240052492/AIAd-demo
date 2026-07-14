import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { membershipService } from '../services/membership.service'
import { ok, fail } from '../utils/response'
import { ValidationError } from '../utils/errors'

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

// 购买套餐（演示：无支付网关，直接成功并发积分）
router.post('/purchase', async (req: Request, res: Response) => {
  try {
    const { planCode } = req.body ?? {}
    if (!planCode || typeof planCode !== 'string') {
      return fail(res, 400, 'planCode 为必填项')
    }
    const result = await membershipService.purchasePlan(req.user!.id, planCode)
    return ok(res, result, '购买成功，积分已到账')
  } catch (err) {
    if (err instanceof ValidationError) return fail(res, 400, err.message)
    return fail(res, 500, (err as Error).message || '购买失败')
  }
})

export { router as membershipRoutes }
