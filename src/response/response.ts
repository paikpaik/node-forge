import type { PaginationMeta } from '../core'

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
  meta?: PaginationMeta
}

export function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data }
}

export function fail(code: string, message: string): ApiResponse<never> {
  return { success: false, error: { code, message } }
}

export function paginated<T>(data: T[], meta: PaginationMeta): ApiResponse<T[]> {
  return { success: true, data, meta }
}
