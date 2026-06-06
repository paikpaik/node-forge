export interface RequestContext {
  traceId: string
  requestId: string
  userId?: string
  ip?: string
  userAgent?: string
}

export interface PaginationMeta {
  total: number
  page: number
  limit: number
  totalPages: number
}

export enum ErrorCode {
  // E94xx — 클라이언트 오류
  BAD_REQUEST = 'E9400',
  UNAUTHORIZED = 'E9401',
  FORBIDDEN = 'E9403',
  NOT_FOUND = 'E9404',
  CONFLICT = 'E9409',
  VALIDATION_ERROR = 'E9422',
  TOO_MANY_REQUESTS = 'E9429',

  // E95xx — 서버/인프라 오류
  INTERNAL_ERROR = 'E9500',
  DB_CONNECTION_ERROR = 'E9510',
  DB_QUERY_ERROR = 'E9511',
  REDIS_CONNECTION_ERROR = 'E9520',
  REDIS_OPERATION_ERROR = 'E9521',
  HTTP_REQUEST_ERROR = 'E9530',
  HTTP_TIMEOUT_ERROR = 'E9531',
}
