import type { RequestContext } from "../core";
import { buildTraceparent } from "../core";

export interface TraceHeaderNames {
  traceId?: string;
  requestId?: string;
}

const DEFAULT_TRACE_ID_HEADER = "x-trace-id";
const DEFAULT_REQUEST_ID_HEADER = "x-request-id";

/**
 * @description 현재 요청의 `traceId`/`requestId`를 아웃바운드 HTTP 요청 헤더로 변환한다.
 * `ForgeHttpClient`에 자동으로 주입되지 않으므로, 호출부에서
 * `http.get(url, { headers: buildTraceHeaders(context) })`처럼 명시적으로 합성해야 한다 —
 * 이렇게 해야 서비스 경계를 넘어도 분산 추적 체인(Logger가 수집한 컨텍스트)이 끊기지 않는다.
 * `context`에 값이 없는 필드는 결과 객체에서 제외되며, `headerNames`로 헤더 이름을 커스터마이즈할 수 있다.
 */
export function buildTraceHeaders(
  context: Partial<Pick<RequestContext, "traceId" | "requestId">>,
  headerNames?: TraceHeaderNames,
): Record<string, string> {
  const headers: Record<string, string> = {};

  if (context.traceId) {
    headers[headerNames?.traceId ?? DEFAULT_TRACE_ID_HEADER] = context.traceId;
  }
  if (context.requestId) {
    headers[headerNames?.requestId ?? DEFAULT_REQUEST_ID_HEADER] = context.requestId;
  }

  return headers;
}

/**
 * @description `RequestContext.traceId`를 W3C `traceparent` 헤더로 변환한다.
 * `traceId`가 있으면 `{ traceparent: '00-{32hexTraceId}-{16hexSpanId}-01' }`를 반환하고,
 * 없으면 `{}`를 반환한다. UUID 포맷의 `traceId`는 대시가 자동으로 제거되어 32-char hex로 변환된다.
 * OTel SDK를 사용하는 경우 active span의 spanId를 전달하면 기존 추적 체인과 연결되며,
 * 생략하면 랜덤 spanId가 자동 생성된다. `buildTraceHeaders`와 spread로 조합해 두 포맷을 동시에 전송할 수 있다.
 */
export function buildTraceparentHeader(
  context: Partial<Pick<RequestContext, "traceId">>,
  spanId?: string,
): Record<string, string> {
  if (!context.traceId) return {};
  return { traceparent: buildTraceparent(context.traceId, spanId) };
}
