import { AsyncLocalStorage } from "node:async_hooks";
import type { RequestContext } from "./types";

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * @description `context`를 현재 비동기 실행 체인 전체(동기 호출은 물론, 이후의 `await`/콜백/
 * 구독까지)에 전파한다. HTTP 미들웨어나 gRPC 인터셉터의 진입점에서 요청당 한 번 호출해두면,
 * 그 아래의 컨트롤러/서비스/gRPC 클라이언트 어디서든 `getRequestContext()`로 같은 값을
 * 꺼내 쓸 수 있다 — 매 계층마다 컨텍스트를 직접 넘길 필요가 없다.
 */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/**
 * @description 현재 비동기 실행 체인에 전파된 `RequestContext`를 꺼낸다. `runWithRequestContext`
 * 바깥(예: HTTP 요청과 무관한 배치/스케줄러)에서 호출되면 `undefined`를 반환한다 — 이 경우
 * 호출부가 억지로 트레이스를 이어붙이지 않고 새 trace를 시작하도록 두는 것이 W3C 스펙에 맞다.
 */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}
