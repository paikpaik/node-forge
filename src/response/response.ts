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

/**
 * @description 성공 응답을 표준 `ApiResponse` 포맷으로 감싼다 (`success: true`).
 * 컨트롤러/핸들러가 반환하는 데이터를 일관된 응답 형태로 통일할 때 사용한다.
 */
export function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data }
}

/**
 * @description 실패 응답을 표준 `ApiResponse` 포맷으로 감싼다 (`success: false`).
 * `code`는 클라이언트가 분기 처리할 수 있는 에러 코드(`E94xx`/`E95xx` 컨벤션), `message`는
 * 사용자에게 노출 가능한 메시지를 의미한다.
 */
export function fail(code: string, message: string): ApiResponse<never> {
  return { success: false, error: { code, message } }
}

/**
 * @description 페이지네이션 메타 정보를 포함한 목록 응답을 표준 `ApiResponse` 포맷으로 감싼다.
 * 목록 조회 API에서 `ok` 대신 사용해 `meta`(전체 개수, 페이지 정보 등)를 함께 전달한다.
 */
export function paginated<T>(data: T[], meta: PaginationMeta): ApiResponse<T[]> {
  return { success: true, data, meta }
}
