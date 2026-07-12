import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { CreditService } from '../services/credit.service'
import { ok, fail } from '../utils/response'

const router = Router()
const creditService = new CreditService()

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

export { router as creditRoutes }
