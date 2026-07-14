import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config'
import { isBlacklisted } from '../utils/token-blacklist'

/**
 * 已认证用户附加在 Request 上的信息
 * id:       历史字段，保持对现有路由（projects/ai/credits/admin/image-jobs 等）兼容
 * userId:   与 JWT payload 对齐的契约字段（payload 为 { userId, roles }）
 * role:     单一角色（兼容 role 单值写入）
 * roles:    角色数组（兼容基于 roles 的校验）
 */
export interface AuthUser {
  id: string
  userId: string
  role?: string
  roles?: string[]
}

// 扩展 Express 的 Request 类型，使 req.user 可被 TS 识别
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

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

/** 解析请求中的 JWT：优先 Authorization: Bearer，其次 httpOnly cookie `access_token` */
function extractToken(req: Request): string | null {
  const header = req.headers.authorization
  if (header && header.startsWith('Bearer ')) {
    const t = header.slice('Bearer '.length).trim()
    if (t) return t
  }
  const cookieToken = readCookie(req.headers.cookie, 'access_token')
  return cookieToken ?? null
}

function buildRoles(payload: Record<string, unknown>): string[] {
  if (Array.isArray(payload.roles)) return payload.roles as string[]
  if (payload.role) return [payload.role as string]
  return []
}

/**
 * JWT 鉴权中间件。
 * - token 来源：Authorization: Bearer <t> 或 cookie `access_token`
 * - 用 env.jwtSecret 校验；payload 含 jti 时做黑名单校验，命中则 401
 * - 挂载 req.user = { id, userId, role?, roles }
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req)
  if (!token) {
    return res.status(401).json({ code: 401, message: '未提供有效的身份凭证', data: null })
  }
  try {
    const payload = jwt.verify(token, env.jwtSecret) as Record<string, unknown>
    const userId = (payload.userId || payload.sub || payload.id) as string | undefined
    if (!userId) {
      return res.status(401).json({ code: 401, message: '身份凭证无效', data: null })
    }

    // 黑名单校验：仅当 payload 携带 jti 时检查
    const jti = payload.jti as string | undefined
    if (jti) {
      const blacklisted = await isBlacklisted(jti)
      if (blacklisted) {
        return res.status(401).json({ code: 401, message: '身份凭证已失效，请重新登录', data: null })
      }
    }

    const roles = buildRoles(payload)
    const role = (payload.role as string | undefined) ?? roles[0]
    req.user = { id: userId, userId, role, roles }
    next()
  } catch {
    return res.status(401).json({ code: 401, message: '身份凭证已失效，请重新登录', data: null })
  }
}

/** 鉴权中间件别名（兼容两种命名） */
export const requireAuth = authMiddleware

/** 兼容其它路由处理器使用的请求类型 */
export type AuthRequest = Request

/** 判断用户是否拥有管理员角色（兼容 role 单值与 roles 数组两种写入方式） */
function isAdmin(user?: AuthUser): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  // 注意：接口字段为 `roles`（见上方 AuthUser 定义），下方曾误写为 `user.roles`，
  // 导致仅以 roles 数组写入的管理员被 requireAdmin 误判为 403。已修正。
  if (Array.isArray(user.roles) && user.roles.includes('admin')) return true
  return false
}

/**
 * 管理员中间件：先鉴权，再校验 admin 角色。
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  authMiddleware(req, res, () => {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ code: 403, message: '需要管理员权限', data: null })
    }
    next()
  })
}
