import { randomBytes } from 'node:crypto'

export interface ParsedTraceparent {
  /** W3C traceId — 32-char lowercase hex (16 bytes) */
  traceId: string
  /** 요청을 보낸 쪽의 span ID — 16-char lowercase hex (8 bytes) */
  parentId: string
  /** trace-flags 최하위 비트: true면 수집 대상(sampled) */
  sampled: boolean
}

const TRACEPARENT_REGEX = /^[\da-f]{2}-([\da-f]{32})-([\da-f]{16})-([\da-f]{2})$/i
const ALL_ZEROS_32 = '0'.repeat(32)
const ALL_ZEROS_16 = '0'.repeat(16)

/**
 * @description W3C Trace Context `traceparent` 헤더 값을 파싱한다.
 * 포맷은 `{version}-{traceId}-{parentId}-{flags}` (예: `00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`).
 * 포맷이 잘못됐거나 traceId/parentId가 모두 0이면 null을 반환한다 — W3C 스펙의
 * "ignore and continue" 원칙에 따라 호출부에서 조용히 fallback 처리한다.
 */
export function parseTraceparent(header: string): ParsedTraceparent | null {
  const match = header.trim().match(TRACEPARENT_REGEX)
  if (!match) return null

  const [, traceId, parentId, flags] = match
  const traceIdLower = traceId.toLowerCase()
  const parentIdLower = parentId.toLowerCase()

  if (traceIdLower === ALL_ZEROS_32 || parentIdLower === ALL_ZEROS_16) return null

  return {
    traceId: traceIdLower,
    parentId: parentIdLower,
    sampled: (parseInt(flags, 16) & 1) === 1,
  }
}

/**
 * @description `RequestContext.traceId`와 선택적 `spanId`로 W3C `traceparent` 헤더 값을 생성한다.
 * `traceId`가 UUID 포맷이면 대시를 제거해 32-char hex로 자동 변환하므로 별도 변환 없이 사용할 수 있다.
 * `spanId`를 생략하면 랜덤 8바이트 hex를 자동 생성한다 — OTel SDK를 쓰는 팀은
 * active span의 spanId를 전달해 기존 추적 체인을 이어받을 수 있다.
 */
export function buildTraceparent(traceId: string, spanId?: string, sampled = true): string {
  const traceIdHex = traceId.replace(/-/g, '').toLowerCase().padEnd(32, '0').slice(0, 32)
  const spanIdHex = spanId
    ? spanId.replace(/-/g, '').toLowerCase().padEnd(16, '0').slice(0, 16)
    : randomBytes(8).toString('hex')
  const flags = sampled ? '01' : '00'
  return `00-${traceIdHex}-${spanIdHex}-${flags}`
}
