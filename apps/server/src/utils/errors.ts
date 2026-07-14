// 应用统一错误类，便于路由层与全局错误处理器区分状态码

/** 业务错误：携带 HTTP 状态码与业务 code */
export class AppError extends Error {
  /** 业务错误码（与响应体 code 一致） */
  code: number
  /** HTTP 状态码 */
  status: number

  constructor(message: string, code = 400, status = 400) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = status
  }
}

/** 资源不存在 */
export class NotFoundError extends AppError {
  constructor(message = '资源不存在') {
    super(message, 404, 404)
    this.name = 'NotFoundError'
  }
}

/** 无权限（未登录） */
export class UnauthorizedError extends AppError {
  constructor(message = '未授权，请先登录') {
    super(message, 401, 401)
    this.name = 'UnauthorizedError'
  }
}

/** 禁止访问（已登录但权限不足） */
export class ForbiddenError extends AppError {
  constructor(message = '权限不足') {
    super(message, 403, 403)
    this.name = 'ForbiddenError'
  }
}

/** 积分余额不足（业务条件，返回 400，与文案解耦） */
export class InsufficientBalanceError extends AppError {
  constructor(message = '积分余额不足') {
    super(message, 400, 400)
    this.name = 'InsufficientBalanceError'
  }
}

/** 参数校验错误 */
export class ValidationError extends AppError {
  constructor(message = '请求参数错误') {
    super(message, 422, 422)
    this.name = 'ValidationError'
  }
}
