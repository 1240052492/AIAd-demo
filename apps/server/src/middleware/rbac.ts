import { Request, Response, NextFunction } from 'express'
import { fail } from '../utils/response'

/**
 * 角色校验中间件工厂
 * 检查 req.user.roles 是否包含 allowedRoles 中的任一角色
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return fail(res, 401, '未认证')
    }
    const hasRole = allowedRoles.some((role) => (req.user!.roles ?? []).includes(role))
    if (!hasRole) {
      return fail(res, 403, '无权访问该资源')
    }
    next()
  }
}

/** 管理员专用校验 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  return requireRole('admin')(req, res, next)
}
