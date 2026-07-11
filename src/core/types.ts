// ── Utility Types ─────────────────────────────────────────────────────────

/** T | null | undefined */
export type Nullable<T> = T | null | undefined;

/** 모든 중첩 프로퍼티를 재귀적으로 optional로 만든다. */
export type DeepPartial<T> = T extends object ? { [P in keyof T]?: DeepPartial<T[P]> } : T;

/** 객체 타입의 value union 타입을 추출한다. */
export type ValueOf<T> = T[keyof T];

/** 특정 키를 Required로 만들고 나머지는 그대로 둔다. */
export type RequireFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

/** Promise를 unwrap한 타입. `Awaited<T>`의 명시적 alias. */
export type Resolved<T> = T extends Promise<infer R> ? R : T;

// ── Domain Types ─────────────────────────────────────────────────────────

export interface RequestContext {
  traceId: string;
  requestId: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export enum ErrorCode {
  // E94xx — 클라이언트 오류
  BAD_REQUEST = "E9400",
  UNAUTHORIZED = "E9401",
  FORBIDDEN = "E9403",
  NOT_FOUND = "E9404",
  CONFLICT = "E9409",
  VALIDATION_ERROR = "E9422",
  TOO_MANY_REQUESTS = "E9429",

  // E95xx — 서버/인프라 오류
  INTERNAL_ERROR = "E9500",
  DB_CONNECTION_ERROR = "E9510",
  DB_QUERY_ERROR = "E9511",
  REDIS_CONNECTION_ERROR = "E9520",
  REDIS_OPERATION_ERROR = "E9521",
  HTTP_REQUEST_ERROR = "E9530",
  HTTP_TIMEOUT_ERROR = "E9531",
}
