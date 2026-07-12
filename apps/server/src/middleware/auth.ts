import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config'

/**
 * 已认证用户附加在 Request 上的信息
 * role: 单一角色（兼容 auth 模块写入）
 * roles: 角色数组（兼容基于 roles 的校验）
 */
export interface AuthUser {
  id: string
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

/**
 * JWT 鉴权中间件。
 * 从 Authorization: Bearer <token> 中解析用户身份并挂载到 req.user。
 * 鉴权失败时直接返回 401，不进入后续处理链。
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ code: 401, message: '未提供有效的身份凭证', data: null })
  }
  const token = header.slice('Bearer '.length)
  try {
    const payload = jwt.verify(token, env.jwtSecret) as Record<string, unknown>
    const userId = (payload.userId || payload.sub || payload.id) as string | undefined
    if (!userId) {
      return res.status(401).json({ code: 401, message: '身份凭证无效', data: null })
    }
    const roles = Array.isArray(payload.roles)
      ? (payload.roles as string[])
      : payload.role
        ? [payload.role as string]
        : []
    req.user = { id: userId, role: payload.role as string | undefined, roles }
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
