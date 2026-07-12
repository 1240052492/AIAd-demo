import { Response } from 'express'
import { PaginatedResponse } from '../types/common'

/** 成功响应（业务 code 固定为 0） */
export function sendSuccess<T>(res: Response, data: T, message = 'ok'): void {
  res.json({ code: 0, message, data })
}

/** 分页成功响应 */
export function sendPaginated<T>(res: Response, page: PaginatedResponse<T>): void {
  res.json({ code: 0, message: 'ok', data: page })
}

/** 错误响应 */
export function sendError(
  res: Response,
  code: number,
  message: string,
  status = 400,
): void {
  res.status(status).json({ code, message, data: null })
}

// ===== 兼容其它模块约定的别名导出 =====

/** 成功响应（别名：ok） */
export const ok = sendSuccess

/** 错误响应（别名：fail，HTTP 状态码默认等于业务 code） */
export function fail(
  res: Response,
  code: number,
  message: string,
  status: number = code,
): void {
  res.status(status).json({ code, message, data: null })
}
