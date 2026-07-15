import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { CreditService } from '../services/credit.service'
import { creditRuleService } from '../services/credit-rule.service'
import { ok, fail } from '../utils/response'
import { rechargeService } from '../services/recharge.service'

const router = Router()
const creditService = new CreditService()

/** GET /api/credits/rules/public - 前端积分预估使用的公开规则 */
router.get('/rules/public', async (_req, res, next) => {
  try {
    const rules = await creditRuleService.getRules()
    return ok(res, rules)
  } catch (err) {
    next(err)
  }
})

/** GET /api/credits/balance - 当前用户积分余额 */
router.get('/balance', authMiddleware, async (req, res, next) => {
  try {
    const account = await creditService.getAccount(req.user!.id)
    return ok(res, { balance: account.balance, frozenBalance: account.frozenBalance })
  } catch (err) {
    next(err)
  }
})

/** GET /api/credits/transactions - 当前用户积分流水（分页） */
router.get('/transactions', authMiddleware, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string, 10) || 20))
    const result = await creditService.getTransactions(req.user!.id, { page, pageSize })
    return ok(res, result)
  } catch (err) {
    next(err)
  }
})

/** POST /api/credits/recharge - 创建待支付订单，不在客户端直接发放积分 */
router.post('/recharge', authMiddleware, async (req, res, next) => {
  try {
    const amount = Number(req.body?.amount)
    if (!Number.isInteger(amount) || amount <= 0) {
      return fail(res, 400, '充值金额必须为正整数（单位：分）')
    }
    const order = await rechargeService.createOrder(req.user!.id, amount, 'alipay')
    return ok(res, {
      order,
      payment: {
        status: 'pending',
        message: '支付宝支付参数尚未配置，请等待支付回调或联系管理员处理。订单未到账。',
      },
    })
  } catch (err) {
    next(err)
  }
})

export { router as creditRoutes }
