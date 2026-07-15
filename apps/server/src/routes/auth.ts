import { Router } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import crypto from 'crypto'
import { prisma, env } from '../config'
import { authMiddleware } from '../middleware/auth'
import { isBlacklisted, addToBlacklist } from '../utils/token-blacklist'
import { registerSchema, loginSchema } from '../utils/validation'
import { ok, fail } from '../utils/response'

const router = Router()

// 访问令牌 / 刷新令牌有效期
const ACCESS_TOKEN_EXPIRES_IN = '15m'
const ACCESS_TOKEN_EXPIRES_IN_SECONDS = 15 * 60
const REFRESH_TOKEN_EXPIRES_IN = '7d'
const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * 刷新令牌密钥：Agent A 会在 config/index.ts 的 env 中新增 refreshTokenSecret；
 * 在它落地前安全回退到 jwtSecret，保证可编译与可运行。
 */
const refreshSecret = (env as { refreshTokenSecret?: string }).refreshTokenSecret ?? env.jwtSecret

/** 从 Cookie 头中解析指定名称的 cookie 值（手动解析，避免引入 cookie-parser 依赖） */
function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined
  const prefix = `${name}=`
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim()
    if (trimmed.startsWith(prefix)) {
      try {
        return decodeURIComponent(trimmed.slice(prefix.length))
      } catch {
        return trimmed.slice(prefix.length)
      }
    }
  }
  return undefined
}

/** 签发访问令牌（含 jti，约 15 分钟过期） */
function signAccessToken(userId: string, roles: string[]): { accessToken: string; expiresIn: number; jti: string } {
  const jti = crypto.randomUUID()
  const accessToken = jwt.sign({ userId, roles, jti }, env.jwtSecret, { expiresIn: ACCESS_TOKEN_EXPIRES_IN })
  return { accessToken, expiresIn: ACCESS_TOKEN_EXPIRES_IN_SECONDS, jti }
}

/** 签发刷新令牌（含独立 jti，约 7 天过期） */
function signRefreshToken(userId: string, roles: string[]): { refreshToken: string; jti: string } {
  const jti = crypto.randomUUID()
  const refreshToken = jwt.sign({ userId, roles, jti }, refreshSecret, { expiresIn: REFRESH_TOKEN_EXPIRES_IN })
  return { refreshToken, jti }
}

/** 设置 httpOnly 刷新令牌 Cookie（手动设置 Set-Cookie，避免额外依赖） */
function setRefreshCookie(res: import('express').Response, token: string): void {
  const secure = env.nodeEnv === 'production' ? ' Secure;' : ''
  const cookie = `refresh_token=${encodeURIComponent(token)}; HttpOnly;${secure} SameSite=Strict; Max-Age=${
    REFRESH_TOKEN_MAX_AGE_MS / 1000
  }; Path=/`
  res.setHeader('Set-Cookie', cookie)
}

/** 清除刷新令牌 Cookie */
function clearRefreshCookie(res: import('express').Response): void {
  const secure = env.nodeEnv === 'production' ? ' Secure;' : ''
  const cookie = `refresh_token=; HttpOnly;${secure} SameSite=Strict; Max-Age=0; Path=/`
  res.setHeader('Set-Cookie', cookie)
}

/** 计算令牌剩余有效期（秒），用于黑名单 exp */
function remainingSeconds(exp: number | undefined): number {
  if (!exp) return 0
  return Math.max(0, Math.floor(exp - Date.now() / 1000))
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
    const { accessToken, expiresIn } = signAccessToken(user.id, roles)
    const { refreshToken } = signRefreshToken(user.id, roles)
    setRefreshCookie(res, refreshToken)

    const { passwordHash: _ph, ...safeUser } = user
    return ok(res, { token: accessToken, accessToken, expiresIn, user: safeUser }, '注册成功')
  } catch (err) {
    // 并发注册同一手机号/邮箱：唯一约束冲突（P2002）应返回 400 而非 500
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return fail(res, 400, '该手机号或邮箱已被注册')
    }
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
    const { accessToken, expiresIn } = signAccessToken(user.id, roles)
    const { refreshToken } = signRefreshToken(user.id, roles)
    setRefreshCookie(res, refreshToken)

    const { passwordHash: _ph, ...safeUser } = user
    // 契约：{ accessToken, expiresIn }；额外保留 token 字段以兼容既有前端
    return ok(res, { token: accessToken, accessToken, expiresIn, user: safeUser }, '登录成功')
  } catch (err) {
    next(err)
  }
})

/** POST /api/auth/refresh - 用 refresh_token cookie 换取新的 accessToken（并旋转 refresh） */
router.post('/refresh', async (req, res, next) => {
  try {
    const refreshToken = readCookie(req.headers.cookie, 'refresh_token')
    if (!refreshToken) {
      return fail(res, 401, '未提供刷新凭证，请重新登录')
    }

    let payload: Record<string, unknown>
    try {
      payload = jwt.verify(refreshToken, refreshSecret) as Record<string, unknown>
    } catch {
      return fail(res, 401, '刷新凭证已失效，请重新登录', 401)
    }

    const jti = payload.jti as string | undefined
    if (jti) {
      const blacklisted = await isBlacklisted(jti)
      if (blacklisted) {
        return fail(res, 401, '刷新凭证已失效，请重新登录', 401)
      }
    }

    const userId = payload.userId as string | undefined
    if (!userId) {
      return fail(res, 401, '刷新凭证无效')
    }
    const roles = Array.isArray(payload.roles) ? (payload.roles as string[]) : []

    // 旋转：使旧 refresh 立即失效（加入黑名单，exp 为其剩余有效期）
    if (jti) {
      const remaining = remainingSeconds(payload.exp as number | undefined)
      if (remaining > 0) await addToBlacklist(jti, remaining)
    }

    const { accessToken, expiresIn } = signAccessToken(userId, roles)
    const { refreshToken: newRefresh } = signRefreshToken(userId, roles)
    setRefreshCookie(res, newRefresh)

    return ok(res, { accessToken, expiresIn })
  } catch (err) {
    next(err)
  }
})

/** 从请求中提取 access token（Bearer 头优先，其次 access_token cookie） */
function extractAccessToken(req: import('express').Request): string | undefined {
  const header = req.headers.authorization
  if (header && header.startsWith('Bearer ')) {
    const t = header.slice('Bearer '.length).trim()
    if (t) return t
  }
  return readCookie(req.headers.cookie, 'access_token')
}

/** POST /api/auth/logout - 将 refresh_token 与 access_token 的 jti 一并拉黑，并清除 cookie */
router.post('/logout', async (_req, res, next) => {
  try {
    // 1) refresh token 拉黑（原有逻辑）
    const refreshToken = readCookie(_req.headers.cookie, 'refresh_token')
    if (refreshToken) {
      try {
        const payload = jwt.verify(refreshToken, refreshSecret) as Record<string, unknown>
        const jti = payload.jti as string | undefined
        const remaining = remainingSeconds(payload.exp as number | undefined)
        if (jti && remaining > 0) {
          await addToBlacklist(jti, remaining)
        }
      } catch {
        // 非法或已过期的 refresh：忽略校验错误，仍清除 cookie
      }
    }

    // 2) access token 拉黑：关闭「登出后 access token 仍可用至过期」的窗口（F12）
    const accessToken = extractAccessToken(_req)
    if (accessToken) {
      try {
        const payload = jwt.verify(accessToken, env.jwtSecret) as Record<string, unknown>
        const jti = payload.jti as string | undefined
        const remaining = remainingSeconds(payload.exp as number | undefined)
        if (jti && remaining > 0) {
          await addToBlacklist(jti, remaining)
        }
      } catch {
        // 非法或已过期的 access：忽略校验错误，仍清除 cookie
      }
    }

    clearRefreshCookie(res)
    return ok(res, null, '已退出登录')
  } catch (err) {
    next(err)
  }
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
