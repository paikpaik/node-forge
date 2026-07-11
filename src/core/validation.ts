/**
 * @description 값을 양의 정수로 파싱한다. 유효하지 않은 값(음수, 소수, 비숫자 등)이면 null을 반환한다.
 * `parsePagination` 내부에서도 사용되며, 단독으로 ID·카운트 파싱에도 활용할 수 있다.
 */
export function parsePositiveInt(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export interface ParsedPagination {
  page: number; // 1-based, 최소 1
  size: number; // 최소 1, 최대 maxSize
  offset: number; // (page - 1) * size
}

/**
 * @description query string의 page/size를 안전하게 파싱하고 offset을 계산한다.
 * 유효하지 않은 값(음수, 0, 비숫자)은 기본값으로 대체하고, maxSize를 초과하면 클램핑한다.
 * 에러를 던지지 않고 조용히 보정하므로 API 입력에 친화적이다.
 */
export function parsePagination(
  query: { page?: unknown; size?: unknown },
  options?: { defaultSize?: number; maxSize?: number },
): ParsedPagination {
  const defaultSize = options?.defaultSize ?? 20;
  const maxSize = options?.maxSize ?? 100;

  const page = Math.max(1, parsePositiveInt(query.page) ?? 1);
  const size = Math.min(maxSize, Math.max(1, parsePositiveInt(query.size) ?? defaultSize));

  return { page, size, offset: (page - 1) * size };
}

export interface ParsedSort {
  field: string;
  direction: "ASC" | "DESC";
}

/**
 * @description query string의 sort 파라미터를 파싱한다. 허용된 필드(`allowedFields`)에 없는
 * 값은 `defaultField`(없으면 allowedFields[0])로 fallback해 SQL injection을 방지한다.
 * 입력 포맷: `"field"` 또는 `"field:asc"` / `"field:desc"` (대소문자 무관).
 */
export function parseSort(
  query: { sort?: unknown },
  allowedFields: string[],
  defaultField?: string,
): ParsedSort {
  const sortStr = typeof query.sort === "string" ? query.sort.trim() : "";
  const [rawField = "", rawDir = ""] = sortStr.split(":");

  const matched = allowedFields.find((f) => f.toLowerCase() === rawField.toLowerCase());
  const field = matched ?? defaultField ?? allowedFields[0] ?? "";
  const direction: "ASC" | "DESC" = rawDir.toUpperCase() === "DESC" ? "DESC" : "ASC";

  return { field, direction };
}

/**
 * @description 값이 null/undefined이면 즉시 에러를 던진다. TypeScript `asserts` 술어를
 * 사용해 이후 코드에서 타입이 `T`로 narrowing된다.
 */
export function assertDefined<T>(value: T | null | undefined, label?: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(label ? `${label} is required` : "Value is required");
  }
}

/**
 * @description 환경 변수가 없거나 빈 문자열이면 명확한 에러를 던진다.
 * 서비스 시작 시 필수 설정을 한 번에 검증해 미설정이 런타임 중간에 드러나는 것을 방지한다.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable "${name}" is required but not set`);
  }
  return value;
}
