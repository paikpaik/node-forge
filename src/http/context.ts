import type { RequestContext } from '../core'

export interface TraceHeaderNames {
  traceId?: string
  requestId?: string
}

const DEFAULT_TRACE_ID_HEADER = 'x-trace-id'
const DEFAULT_REQUEST_ID_HEADER = 'x-request-id'

/**
 * @description 현재 요청의 `traceId`/`requestId`를 아웃바운드 HTTP 요청 헤더로 변환한다.
 * `ForgeHttpClient`에 자동으로 주입되지 않으므로, 호출부에서
 * `http.get(url, { headers: buildTraceHeaders(context) })`처럼 명시적으로 합성해야 한다 —
 * 이렇게 해야 서비스 경계를 넘어도 분산 추적 체인(Logger가 수집한 컨텍스트)이 끊기지 않는다.
 * `context`에 값이 없는 필드는 결과 객체에서 제외되며, `headerNames`로 헤더 이름을 커스터마이즈할 수 있다.
 */
export function buildTraceHeaders(
  context: Partial<Pick<RequestContext, 'traceId' | 'requestId'>>,
  headerNames?: TraceHeaderNames,
): Record<string, string> {
  const headers: Record<string, string> = {}

  if (context.traceId) {
    headers[headerNames?.traceId ?? DEFAULT_TRACE_ID_HEADER] = context.traceId
  }
  if (context.requestId) {
    headers[headerNames?.requestId ?? DEFAULT_REQUEST_ID_HEADER] = context.requestId
  }

  return headers
}
