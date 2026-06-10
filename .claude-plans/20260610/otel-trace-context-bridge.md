## 플랜 실행 이력

### 완료: 2026-06-10

**결과**: 성공

**실제 변경 파일**:
- `src/core/traceparent.ts` (신규) — `ParsedTraceparent`, `parseTraceparent`(W3C 포맷 파싱, 잘못된 포맷/all-zero시 null), `buildTraceparent`(UUID→32hex 자동 변환, spanId 생략 시 랜덤 생성)
- `src/core/traceparent.test.ts` (신규) — `parseTraceparent` 7개, `buildTraceparent` 6개 총 13개 테스트 (split 인덱스 버그 1건 수정)
- `src/core/index.ts` — `export * from './traceparent'` 추가
- `src/logger/fastify/logger.plugin.ts` — `parseTraceparent` import, `onRequest` 훅에서 `traceparent` 헤더 우선 인식 → `x-trace-id` fallback → UUID 생성 순서로 변경
- `src/logger/fastify/logger.plugin.test.ts` (신규) — `vi.mock('../logger')`로 `createLogger` 모킹해서 `withContext` 호출 인자 캡처. 6개 테스트
- `src/http/context.ts` — `buildTraceparent` import, `buildTraceparentHeader` 함수 추가
- `src/http/context.test.ts` — `buildTraceparentHeader` 테스트 5개 추가 (기존 5개 포함 총 10개)

**계획과의 차이**:
`ForgeLogger`에 `.context` 프로퍼티가 없어 logger plugin 테스트 방식이 바뀌었다. 처음에는 `request.forgeLogger.context.traceId`로 접근하려 했으나 `ForgeLogger`가 pino를 private으로 감싸 context에 직접 접근할 방법이 없었다. `vi.mock('../logger')`로 `createLogger`를 모킹하고 `withContext` 호출 인자를 캡처하는 방식으로 변경했다.
최종적으로 `npm test`(238개, 기존 214 + 신규 24 모두 통과), `npm run build`(`.d.ts` 정상 생성), `npm run lint` 수행. lint 에러 2건은 기존 pre-existing 이슈.

**잔존 작업**:
없음

---

# otel-trace-context-bridge — W3C Trace Context 포맷 호환 브리지

## 목표

OpenTelemetry와 직접 결합하지 않고 **W3C Trace Context 표준**(OTel이 채택한 공개 표준)을 지원해,
node-forge를 쓰는 서비스가 OTel 기반 분산 추적 인프라와 자연스럽게 연결될 수 있게 한다.
`@opentelemetry/sdk-node` 의존성을 추가하지 않으므로 OTel을 사용하지 않는 팀에게는 아무 영향이 없고,
OTel을 쓰는 팀은 `traceparent` 헤더를 통해 traceId를 자동으로 이어받고 전파할 수 있다.

## 현재 상태 (AS-IS)

```ts
// logger/fastify/logger.plugin.ts — x-trace-id 헤더만 인식, W3C traceparent 헤더 무시
fastify.addHook('onRequest', (request, _reply, done) => {
  const traceId = (request.headers['x-trace-id'] as string) ?? crypto.randomUUID()
  const requestId = (request.headers['x-request-id'] as string) ?? crypto.randomUUID()
  request.forgeLogger = logger.withContext({ traceId, requestId, ip: request.ip })
  done()
})

// http/context.ts — 커스텀 헤더(x-trace-id)만 생성, W3C traceparent 헤더 없음
export function buildTraceHeaders(context, headerNames?): Record<string, string>
```

OTel SDK가 자동 계측한 서비스에서 `traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01` 헤더를 전달해도 node-forge는 이를 무시하고 새 UUID를 생성한다. 반대로 node-forge 서비스에서 아웃바운드 요청을 보낼 때도 `traceparent` 헤더를 생성하는 방법이 없어 OTel 수집기에서 trace 체인이 끊긴다.

## 변경 후 상태 (TO-BE)

### 1. W3C Trace Context 파싱/생성 유틸 (core)

```ts
// src/core/traceparent.ts
export interface ParsedTraceparent {
  traceId: string   // 32-char lowercase hex (16 bytes)
  parentId: string  // 16-char lowercase hex (8 bytes) — 요청을 보낸 쪽의 span ID
  sampled: boolean  // flags 최하위 비트
}

// traceparent 헤더 값("00-{traceId}-{parentId}-{flags}")을 파싱
export function parseTraceparent(header: string): ParsedTraceparent | null

// RequestContext.traceId + spanId로 traceparent 헤더 값을 생성
// traceId가 UUID 포맷이면 대시를 제거해 32-char hex로 변환
// spanId를 생략하면 랜덤 8바이트 hex를 자동 생성
export function buildTraceparent(traceId: string, spanId?: string, sampled?: boolean): string
```

### 2. Fastify 로거 플러그인 확장 — traceparent 우선 인식

```ts
// logger/fastify/logger.plugin.ts
fastify.addHook('onRequest', (request, _reply, done) => {
  const rawTraceparent = request.headers['traceparent'] as string | undefined
  const traceId =
    (rawTraceparent ? parseTraceparent(rawTraceparent)?.traceId : undefined) ??
    (request.headers['x-trace-id'] as string | undefined) ??
    crypto.randomUUID()
  const requestId = (request.headers['x-request-id'] as string | undefined) ?? crypto.randomUUID()
  request.forgeLogger = logger.withContext({ traceId, requestId, ip: request.ip })
  done()
})
```

W3C `traceparent`가 있으면 그 안의 traceId를 재사용해 기존 분산 추적 체인을 이어받는다.
없으면 기존 `x-trace-id` → UUID 생성 순서로 fallback해 하위 호환을 유지한다.

### 3. 아웃바운드 traceparent 헤더 생성 헬퍼 (http)

```ts
// src/http/context.ts 추가
export function buildTraceparentHeader(
  context: Partial<Pick<RequestContext, 'traceId'>>,
  spanId?: string,
): Record<string, string>
// traceId가 있으면 { traceparent: '00-{32hexTraceId}-{16hexSpanId}-01' }
// traceId가 없으면 {} (빈 객체)
```

두 헬퍼를 조합해 OTel 표준 헤더와 커스텀 헤더를 동시에 전송:
```ts
await this.http.get(url, {
  headers: {
    ...buildTraceHeaders(ctx),           // x-trace-id, x-request-id
    ...buildTraceparentHeader(ctx),       // traceparent (OTel 호환)
  },
})
```

## 변경 범위

| 파일 | 변경 내용 |
|------|----------|
| `src/core/traceparent.ts` (신규) | `ParsedTraceparent`, `parseTraceparent`, `buildTraceparent` |
| `src/core/traceparent.test.ts` (신규) | 파싱/생성 단위 테스트 (정상/비정상 헤더, UUID→hex 변환, spanId 자동 생성) |
| `src/core/index.ts` | `export * from './traceparent'` 추가 |
| `src/logger/fastify/logger.plugin.ts` | `parseTraceparent` import, `onRequest` 훅에서 `traceparent` 헤더 우선 인식 |
| `src/logger/fastify/logger.plugin.test.ts` (신규) | `traceparent` 헤더 인식, `x-trace-id` fallback, 둘 다 없을 때 UUID 생성 검증 |
| `src/http/context.ts` | `buildTraceparentHeader` 추가 |
| `src/http/context.test.ts` | `buildTraceparentHeader` 테스트 추가 |

## 영향성

| 영향 대상 | 영향 내용 |
|-----------|----------|
| 기존 `x-trace-id` 사용 서비스 | 변경 없음 — `traceparent` 없을 때 기존 fallback 경로 그대로 |
| `buildTraceHeaders` | 변경 없음 — `buildTraceparentHeader`는 별도 함수로 추가 |
| `@opentelemetry/*` 의존성 | 추가 없음 — W3C 포맷은 순수 문자열 파싱/생성, OTel SDK 불필요 |
| `src/core` 순수성 | 유지 — `traceparent.ts`는 외부 런타임 의존성 없는 순수 함수 |

## Breaking Changes

없음 — 로거 플러그인의 traceId 추출 로직은 `traceparent` 헤더가 **없을 때** 기존 동작과 완전히 동일하다.

## 위험도

**MEDIUM** — `logger/fastify/logger.plugin.ts`의 traceId 추출 로직이 변경되어, `traceparent` 헤더가 잘못된 포맷으로 전달될 경우 traceId가 fallback으로 처리되어야 한다. `parseTraceparent`가 null을 반환하는 경우 처리를 명확히 해야 한다.

## 주의사항

- **W3C traceId 형식**: 32-char lowercase hex (16 bytes). UUID에서 대시를 제거하면 정확히 32자. `buildTraceparent`에서 입력 traceId를 정규화할 때 대시 제거 + lowercase + 32자 맞춤(잘라내거나 패딩)을 수행한다.
- **잘못된 traceparent 수신 시 동작**: `parseTraceparent`가 `null`을 반환하면 traceId를 조용히 `x-trace-id` → UUID로 fallback 처리한다. 에러를 던지거나 요청을 거부하지 않는다 (W3C 스펙의 "ignore and continue" 원칙).
- **spanId(parentId)**: 아웃바운드 `buildTraceparentHeader`에서 `spanId`를 생략하면 `crypto.randomBytes(8).toString('hex')`로 랜덤 생성한다. OTel을 쓰는 팀은 active span의 spanId를 직접 전달해 연결고리를 이을 수 있다.
- **sampled 플래그**: `buildTraceparent`의 기본값은 `sampled: true`(`01`). 샘플링 결정은 OTel Sampler 담당이므로 node-forge에서 제어하지 않는다.

## 작업 단계

### 1단계: core/traceparent.ts 구현 및 테스트

1. `src/core/traceparent.ts` 작성 — `ParsedTraceparent`, `parseTraceparent`, `buildTraceparent`, `@description` JSDoc
2. `src/core/index.ts`에 `export * from './traceparent'` 추가
3. `src/core/traceparent.test.ts` 작성:
   - `parseTraceparent` — 유효한 헤더 파싱, 대/소문자 무관, null 반환 케이스(형식 불일치, all-zero traceId, 짧은 헤더)
   - `buildTraceparent` — UUID → 32hex 정규화, spanId 생략 시 자동 생성(16char hex), sampled 플래그
4. `npm test` 회귀 확인

### 2단계: logger/fastify/logger.plugin.ts 확장 및 테스트

1. `logger.plugin.ts` 수정 — `parseTraceparent` import, `onRequest` 훅 로직 변경 (traceparent 우선 → x-trace-id fallback → UUID 생성)
2. `src/logger/fastify/logger.plugin.test.ts` 작성 (신규):
   - `traceparent` 헤더 있을 때 traceId 추출 확인
   - `traceparent` 헤더가 잘못됐을 때 `x-trace-id` fallback 확인
   - 둘 다 없을 때 UUID 형태로 생성 확인
   - `x-request-id` 헤더 처리는 기존과 동일한지 확인
3. `npm test` 회귀 확인

### 3단계: http/context.ts 확장 및 테스트

1. `src/http/context.ts`에 `buildTraceparentHeader` 추가 — `traceId` 없으면 `{}` 반환, spanId 생략 시 랜덤 생성, `@description` JSDoc
2. `src/http/context.test.ts`에 테스트 추가:
   - traceId 있을 때 `traceparent` 키 포함 확인
   - UUID traceId → 대시 제거된 32hex로 정규화 확인
   - traceId 없을 때 `{}` 반환 확인
   - spanId 생략 시 16-char hex가 자동 생성되는지 확인
3. `npm test`, `npm run build`, `npm run lint` 전체 검증

## 검증 방법

- [ ] `npm test` — 신규 테스트 통과 + 기존 테스트(현재 214개) 회귀 없음
- [ ] `npm run build` — `dist/core/index.d.ts`에 `ParsedTraceparent`, `parseTraceparent`, `buildTraceparent` export 포함
- [ ] `npm run build` — `dist/http/index.d.ts`에 `buildTraceparentHeader` export 포함
- [ ] `parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01')` → `{ traceId: '4bf92f3577b34da6a3ce929d0e0e4736', parentId: '00f067aa0ba902b7', sampled: true }` 확인
- [ ] UUID traceId로 `buildTraceparent('550e8400-e29b-41d4-a716-446655440000')` → `00-550e8400e29b41d4a716446655440000-{random16hex}-01` 형식 확인
- [ ] Fastify logger plugin: `traceparent` 헤더 있을 때 해당 traceId가 `request.forgeLogger` 컨텍스트에 포함되는지 확인
- [ ] `npm run lint` — 통과 (기존 2건 pre-existing 에러 제외)

## 참조 규칙

- `[[inbound-request-metrics]]` — `routeOptions.url` 사용 사례처럼 프레임워크 버전별 API 차이 확인 필요
- `.claude/CLAUDE.md` — `core` 순수성: `traceparent.ts`는 외부 런타임 의존성 없는 순수 유틸로 유지
- W3C Trace Context 스펙 — https://www.w3.org/TR/trace-context/ (traceparent 포맷, "ignore and continue" 처리 원칙)
