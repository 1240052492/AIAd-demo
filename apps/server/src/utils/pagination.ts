import { PaginatedResponse } from '../types/common'

export interface PaginationParams {
  page: number
  pageSize: number
  skip: number
  take: number
}

/**
 * 从 query 解析分页参数。
 * 默认 page=1, pageSize=20, 最大 pageSize=100。
 */
export function parsePagination(query: Record<string, any>): PaginationParams {
  let page = parseInt(query.page as string, 10)
  if (!Number.isFinite(page) || page < 1) page = 1

  let pageSize = parseInt(query.pageSize as string, 10)
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = 20
  if (pageSize > 100) pageSize = 100

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  }
}

/** 组装统一分页响应 */
export function toPaginated<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): PaginatedResponse<T> {
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  }
}
