import { Router } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { prisma, env } from '../config'
import { authMiddleware } from '../middleware/auth'
import { registerSchema, loginSchema } from '../utils/validation'
import { ok, fail } from '../utils/response'

const router = Router()

/** 生成 JWT：payload 仅包含 userId 与 roles */
function signToken(userId: string, roles: string[]): string {
  return jwt.sign({ userId, roles }, env.jwtSecret, { expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'] })
}

/** POST /api/auth/register */
router.post('/register', async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body)
    if (!parsed.success) {
      return fail(res, 400, parsed.error.issues[0]?.message || '参数错误')
    }
    const { phone, email, password, nickname } = parsed.data

    // 唯一性校验
    if (phone) {
      const exists = await prisma.user.findUnique({ where: { phone } })
      if (exists) return fail(res, 400, '该手机号已被注册')
    }
    if (email) {
      const exists = await prisma.user.findUnique({ where: { email } })
      if (exists) return fail(res, 400, '该邮箱已被注册')
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const defaultRole = await prisma.role.findUnique({ where: { code: 'user' } })
    if (!defaultRole) {
      return fail(res, 500, '默认角色不存在，请先执行 seed')
    }

    // 创建用户 + 角色 + 积分账户 + 注册赠送流水（事务）
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { phone, email, nickname, passwordHash },
      })
      await tx.userRole.create({ data: { userId: created.id, roleId: defaultRole.id } })
      const account = await tx.creditAccount.create({
        data: { userId: created.id, balance: env.registerBonusCredits },
      })
      await tx.creditTransaction.create({
        data: {
          userId: created.id,
          accountId: account.id,
          type: 'register_bonus',
          amount: env.registerBonusCredits,
          balanceAfter: account.balance,
          reason: '注册赠送积分',
        },
      })
      return created
    })

    const roles = ['user']
    const token = signToken(user.id, roles)

    const { passwordHash: _ph, ...safeUser } = user
    return ok(res, { token, user: safeUser }, '注册成功')
  } catch (err) {
    next(err)
  }
})

/** POST /api/auth/login */
router.post('/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) {
      return fail(res, 400, parsed.error.issues[0]?.message || '参数错误')
    }
    const { phone, email, password } = parsed.data

    const where: Prisma.UserWhereInput = {}
    if (phone) where.phone = phone
    if (email) where.email = email
    if (!phone && !email) {
      return fail(res, 400, '请填写手机号或邮箱')
    }

    const user = await prisma.user.findFirst({
      where,
      include: { roles: { include: { role: true } } },
    })
    if (!user) {
      return fail(res, 401, '用户不存在')
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return fail(res, 401, '密码错误')
    }

    if (user.status !== 'active') {
      return fail(res, 403, '账号已被禁用或封禁')
    }

    const roles = user.roles.map((ur) => ur.role.code)
    const token = signToken(user.id, roles)

    const { passwordHash: _ph, ...safeUser } = user
    return ok(res, { token, user: safeUser }, '登录成功')
  } catch (err) {
    next(err)
  }
})

/** POST /api/auth/logout - 客户端清除 token 即可 */
router.post('/logout', authMiddleware, (_req, res) => {
  return ok(res, null, '已退出登录')
})

/** GET /api/auth/me - 当前用户信息（不含密码） */
router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { roles: { include: { role: true } } },
    })
    if (!user) {
      return fail(res, 404, '用户不存在')
    }
    const { passwordHash: _ph, ...safeUser } = user
    return ok(res, safeUser)
  } catch (err) {
    next(err)
  }
})

export { router as authRoutes }
