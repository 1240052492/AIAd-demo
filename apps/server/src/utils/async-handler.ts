import { Request, Response, NextFunction, RequestHandler } from 'express'
import { AppError } from './errors'

/**
 * 包装异步路由处理函数，将抛出的错误统一转交给 Express 错误中间件。
 * - AppError 会保留其 status / code
 * - 其它未知错误降级为 500
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => next(err))
  }
}

export { AppError }
