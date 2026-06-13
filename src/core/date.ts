/**
 * @description string 또는 Date를 Date로 파싱한다. 유효하지 않은 값(null, undefined, 빈 문자열,
 * 잘못된 형식)이면 null을 반환한다. 숫자 타입(타임스탬프)은 지원하지 않는다.
 */
export function parseDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value
  }
  if (typeof value === 'string' && value.length > 0) {
    const date = new Date(value)
    return isNaN(date.getTime()) ? null : date
  }
  return null
}

/**
 * @description date로부터 ttlMs가 경과했으면 true를 반환한다.
 * 캐시 항목이나 토큰의 만료 여부를 확인할 때 사용한다.
 */
export function isExpired(date: Date, ttlMs: number): boolean {
  return Date.now() - date.getTime() > ttlMs
}

/**
 * @description date의 시각을 로컬 타임존 기준 00:00:00.000으로 맞춘 새 Date를 반환한다.
 * 원본 date는 변경되지 않는다.
 */
export function toStartOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * @description date의 시각을 로컬 타임존 기준 23:59:59.999로 맞춘 새 Date를 반환한다.
 * 원본 date는 변경되지 않는다.
 */
export function toEndOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

/**
 * @description 두 날짜 사이의 일수를 절대값으로 반환한다. 시간 단위는 버린다.
 * 서머타임 전환이 있는 타임존에서는 극히 드물게 1일 오차가 생길 수 있다.
 */
export function daysBetween(a: Date, b: Date): number {
  return Math.floor(Math.abs(a.getTime() - b.getTime()) / 86_400_000)
}

/**
 * @description Date를 UTC 기준 'YYYY-MM-DD' 형식 문자열로 변환한다.
 */
export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * @description Date를 UTC 기준 'YYYY-MM-DDTHH:mm:ss' 형식 문자열로 변환한다.
 */
export function toDateTimeString(date: Date): string {
  return date.toISOString().slice(0, 19)
}
