import { Metadata } from "@grpc/grpc-js";
import { buildTraceparent, getRequestContext } from "../../core";

/**
 * @description 현재 `runWithRequestContext`로 전파된 요청 컨텍스트로 `traceparent`를 만들어
 * gRPC 클라이언트 호출에 실어 보낼 `Metadata`를 만든다. 컨텍스트가 없으면(예: HTTP 요청과
 * 무관한 스케줄러/폴러에서 호출) `traceparent`를 아예 넣지 않는다 — 억지로 이어붙이지 않고
 * 받는 쪽이 새 trace를 시작하도록 두는 것이 W3C 스펙에 맞는 동작이다.
 */
export function buildOutgoingTraceMetadata(): Metadata {
  const metadata = new Metadata();
  const context = getRequestContext();
  if (context) {
    metadata.set("traceparent", buildTraceparent(context.traceId));
  }
  return metadata;
}
