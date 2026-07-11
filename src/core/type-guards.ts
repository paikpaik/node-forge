/**
 * @description 값이 null/undefined가 아님을 보장하는 타입 가드.
 * `arr.filter(isNonNull)`처럼 사용하면 `(T | null | undefined)[]`가 `T[]`로 narrowing된다.
 * 0, 빈 문자열, false 같은 falsy 값은 제거하지 않는다 (`filter(Boolean)`과 다름).
 */
export function isNonNull<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * @description 값이 `string` 타입인지 검사한다.
 */
export function isString(value: unknown): value is string {
  return typeof value === "string";
}

/**
 * @description 값이 `number` 타입인지 검사한다. `NaN`은 typeof가 'number'이므로 true를 반환한다.
 */
export function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

/**
 * @description 값이 `boolean` 타입인지 검사한다.
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

/**
 * @description 값이 순수 객체(`Record<string, unknown>`)인지 검사한다.
 * null, 배열, Date 등은 false를 반환한다.
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @description 값이 배열인지 검사한다.
 */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * @description JSON 문자열을 안전하게 파싱한다. 파싱에 실패하면 에러를 던지지 않고 null을 반환한다.
 * 파싱 결과의 형태는 제네릭 `T`로 지정할 수 있지만 런타임 검증은 하지 않는다.
 */
export function safeJsonParse<T = unknown>(str: string): T | null {
  try {
    return JSON.parse(str) as T;
  } catch {
    return null;
  }
}
