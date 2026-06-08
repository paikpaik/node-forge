## 플랜 실행 이력

### 완료: 2026-06-07

**결과**: 성공

**실제 변경 파일**:
- `src/http/context.ts` (신규) — `TraceHeaderNames`, `buildTraceHeaders(context, headerNames?)` 추가. `traceId`/`requestId` 중 있는 값만 헤더로 변환하는 순수 함수
- `src/http/index.ts` — `export * from './context'` 추가
- `src/http/context.test.ts` (신규) — 5개 테스트 (기본 헤더명, 일부만 있는 경우, 없는 경우, 커스텀 헤더명)
- `src/health/health.ts` (신규) — `HealthChecker`/`HealthCheckResult`/`HealthReport` 타입, `checkHealth`(병렬 실행+집계), `createDatabaseHealthChecker`(SELECT 1로 실제 쿼리 가능 여부까지 확인), `createRedisHealthChecker`(`ping()` 활용)
- `src/health/index.ts`, `src/health/health.test.ts` (신규, 8개 테스트)
- `src/health/nestjs/health.controller.ts`, `health.module.ts`, `health.constants.ts`, `index.ts` (신규) — `HealthController`(`GET /health`, 비정상 시 503 `HttpException`), `HealthModule.forRoot({ checkers })`
- `src/health/nestjs/health.controller.test.ts`, `health.module.test.ts` (신규, 3개 테스트)
- `src/health/fastify/health.plugin.ts`, `index.ts` (신규) — `fastifyHealth({ checkers })`, `GET /health` 라우트 등록 (비정상 시 `reply.code(503)`)
- `src/health/fastify/health.plugin.test.ts` (신규, 2개 테스트)
- `tsup.config.ts` — `modules` 배열에 `'health'` 추가
- `package.json` — exports 블록을 26 → 29개 항목으로 재생성(`./health`, `./health/nestjs`, `./health/fastify` 추가), `api-versioning-module` 때와 동일하게 전체 정렬을 재계산
- `src/index.ts` — `export * from './health'` 추가

**계획과의 차이**:
없음 — 계획한 5단계(http 헬퍼 → health 코어 → NestJS 통합 → Fastify 통합 → 패키지 배선/검증)를 그대로 진행했고, "옵션은 호출 시점에 명시적으로 전달" 원칙대로 `buildTraceHeaders`는 순수 함수로, `ForgeHttpClient`에는 인터셉터를 자동 등록하지 않았다. 매 단계 `npx vitest run`으로 회귀 확인. 최종적으로 `npm test`(199개, 기존 181 + 신규 18 모두 통과), `npm run build`(`.d.ts`에 `@description` 정상 포함 확인), `npm run lint` 수행. lint에서 발견된 2개 에러(`events.explorer.ts`의 `no-extra-semi`, `versioning.plugin.ts`의 `no-this-alias`)는 이번 작업 이전부터 있던 기존 이슈로(이전 `jsdoc-description-rollout` 작업 때도 동일하게 확인됨) 손대지 않음.

**잔존 작업**:
없음 — 위 2개 lint 에러는 이번 작업 범위 밖의 기존 이슈

---

# http-context-propagation-and-health-check — Correlation ID 전파 헬퍼 + Health Check 모듈 추가

## 목표

1. `ForgeHttpClient`로 외부 API를 호출할 때 현재 요청의 `RequestContext`(traceId/requestId)를 헤더로 쉽게 전파할 수 있는 헬퍼를 제공해, Logger가 수집한 분산 추적 정보가 아웃바운드 호출에서 끊기지 않도록 한다.
2. `database`/`redis` 연결 상태를 표준화된 형태로 점검하고 `/health` 엔드포인트로 노출하는 새 `health` 모듈을 추가한다.

## 현재 상태 (AS-IS)

- `src/logger/fastify/logger.plugin.ts:30-32`에서 매 요청마다 `x-trace-id`/`x-request-id` 헤더(또는 신규 UUID)를 추출해 `request.forgeLogger`에 컨텍스트로 주입하고 있음. 하지만 `ForgeHttpClient`(`src/http/http.ts`)로 외부 API를 호출할 때 이 traceId/requestId를 헤더로 전달하는 기능이 없어, 분산 추적 체인이 서비스 경계에서 끊긴다.
- `ForgeRedisClient`에는 연결 확인용 `ping()`(`src/redis/redis.ts:749`)이 있고, `database` 모듈은 `dataSource.isInitialized`로 연결 상태를 알 수 있지만(`src/database/database.ts:21`), 이를 표준 포맷으로 집계하거나 `/health` 라우트로 노출하는 모듈이 없음. 현재 8개 모듈(core/response/logger/redis/database/http/events/metrics/versioning) 어디에도 헬스 체크 기능은 없음.

## 변경 후 상태 (TO-BE)

### 1. Correlation ID 전파 헬퍼 (http)

`RequestContext`를 HTTP 헤더로 변환하는 순수 함수를 제공한다. `versioning` 모듈에서 정립한 "옵션은 호출 시점에 명시적으로 전달" 원칙을 그대로 따라, 전역 등록이나 자동 주입이 아니라 호출부에서 명시적으로 합성하는 방식으로 설계한다.

```ts
// src/http/context.ts
export interface TraceHeaderNames {
  traceId?: string   // 기본값: 'x-trace-id'
  requestId?: string // 기본값: 'x-request-id'
}

export function buildTraceHeaders(
  context: Partial<Pick<RequestContext, 'traceId' | 'requestId'>>,
  headerNames?: TraceHeaderNames,
): Record<string, string>
```

사용 예:
```ts
// NestJS 컨트롤러에서
await this.http.get(url, { headers: buildTraceHeaders(request.forgeLogger.context) })
```

### 2. Health Check 모듈 신설

`checkHealth`로 여러 체커를 병렬 실행해 표준 리포트를 만들고, `database`/`redis`용 기본 체커와 NestJS/Fastify 통합을 제공한다.

```ts
// src/health/health.ts
export type HealthChecker = () => Promise<void>  // 정상이면 resolve, 비정상이면 reject

export interface HealthCheckResult {
  name: string
  status: 'up' | 'down'
  error?: string
}

export interface HealthReport {
  status: 'ok' | 'error'
  checks: HealthCheckResult[]
}

export async function checkHealth(checkers: Record<string, HealthChecker>): Promise<HealthReport>

// 기본 체커 팩토리
export function createDatabaseHealthChecker(dataSource: DataSource): HealthChecker
export function createRedisHealthChecker(client: ForgeRedisClient): HealthChecker
```

- NestJS: `HealthModule.forRoot({ checkers })` + `HealthController`(`GET /health`, 비정상 시 503)
- Fastify: `fastifyHealth(options: { checkers })` 플러그인 — `GET /health` 라우트 자동 등록

## 변경 범위

| 파일 | 변경 내용 |
|------|----------|
| `src/http/context.ts` (신규) | `buildTraceHeaders`/`TraceHeaderNames` 추가 |
| `src/http/index.ts` | `export * from './context'` 추가 |
| `src/http/http.test.ts` 또는 `src/http/context.test.ts` (신규) | `buildTraceHeaders` 단위 테스트 |
| `src/health/health.ts` (신규) | `HealthChecker`/`HealthCheckResult`/`HealthReport`, `checkHealth`, `createDatabaseHealthChecker`, `createRedisHealthChecker` |
| `src/health/index.ts` (신규) | re-export |
| `src/health/health.test.ts` (신규) | 코어 함수·체커 단위 테스트 |
| `src/health/nestjs/health.controller.ts`, `health.module.ts`, `index.ts` (신규) | `HealthController`, `HealthModule.forRoot` |
| `src/health/nestjs/*.test.ts` (신규) | 컨트롤러/모듈 테스트 |
| `src/health/fastify/health.plugin.ts`, `index.ts` (신규) | `fastifyHealth` 플러그인 |
| `src/health/fastify/*.test.ts` (신규) | 플러그인 테스트 |
| `tsup.config.ts` | `modules` 배열에 `'health'` 추가 |
| `package.json` | `exports`에 `./health`, `./health/nestjs`, `./health/fastify` 3-path 추가 (기존 수동 정렬 컬럼 폭에 맞춰 전체 재정렬) |
| `src/index.ts` | `export * from './health'` 추가 |

## 영향성

| 영향 대상 | 영향 내용 |
|-----------|----------|
| `ForgeHttpClient` 기존 동작 | 변경 없음 — 새 순수 함수만 추가, 클라이언트는 헤더를 명시적으로 합성해야만 동작 (opt-in) |
| 기존 7개 모듈 | 변경 없음 — `health`는 완전히 독립된 신규 모듈 |
| `package.json` exports | `./health*` 3-path 추가로 인해 기존 26개 항목의 정렬 폭이 재계산됨 (api-versioning-module 작업 때와 동일한 패턴) |
| 런타임 의존성 | 변경 없음 — `health`는 `database`/`redis`를 모두 `peerDependencies`로 이미 갖고 있는 기존 모듈의 타입만 참조 |

## Breaking Changes

없음 — 기존 모듈은 헬퍼 함수 추가만 있을 뿐 시그니처/동작 변경이 없고, `health`는 신규 모듈이라 기존 사용자에게 영향 없음

## 위험도

**LOW** — http 쪽은 순수 함수 추가(부수효과 없음), health는 신규 독립 모듈이라 기존 코드 경로에 영향이 없음. `package.json` exports 정렬만 `api-versioning-module` 때처럼 주의해서 재계산하면 됨

## 주의사항

- correlation-id 전파는 "전역 등록/자동 주입"이 아니라 **호출 시점에 명시적으로 헤더를 합성**하는 방식으로 설계한다 (`[[api-versioning-module]]`에서 사용자가 확정한 설계 원칙과 동일). `ForgeHttpClient`에 인터셉터를 자동으로 붙이지 않는다.
- `HealthChecker`는 "정상이면 resolve, 비정상이면 reject"하는 단순한 함수 타입으로 설계해, 사용자가 직접 만든 체커도 동일한 인터페이스로 합성할 수 있게 한다 (NestJS Terminus의 `HealthIndicator` 패턴과 유사하되 훨씬 가볍게).
- `checkHealth`는 `Promise.allSettled`로 체커들을 병렬 실행해, 하나가 느리거나 실패해도 전체 응답이 막히지 않게 한다.
- `package.json` exports 블록은 `api-versioning-module` 작업 때처럼 전체를 재계산해서 정렬을 통일한다 (사용자가 "수동정렬 공백을 맞추려면 전부 맞추는게 좋을것 같다"고 명시한 바 있음).
- 새 모듈이므로 `.claude/CLAUDE.md`의 "새 모듈 추가 방법" 8단계를 그대로 따른다.

## 작업 단계

### 1단계: correlation-id 헤더 전파 헬퍼 (http)

1. `src/http/context.ts` 작성 — `TraceHeaderNames`, `buildTraceHeaders` (+ `@description`)
2. `src/http/index.ts`에 re-export 추가
3. 단위 테스트 작성 (기본 헤더 이름, 커스텀 헤더 이름, traceId/requestId 일부만 있는 경우, 둘 다 없는 경우)
4. `npm test` 회귀 확인

### 2단계: health 코어 모듈

1. `src/health/health.ts` — `HealthChecker`/`HealthCheckResult`/`HealthReport` 타입, `checkHealth`, `createDatabaseHealthChecker`, `createRedisHealthChecker` (+ `@description`)
2. `src/health/index.ts` 작성
3. 단위 테스트 작성 (정상/비정상 체커 혼합, 체커 없음, DB/Redis 체커가 ping/query 실패 시 down 처리)
4. `npm test` 회귀 확인

### 3단계: NestJS 통합

1. `src/health/nestjs/health.controller.ts` — `GET /health`, 비정상 시 503 반환
2. `src/health/nestjs/health.module.ts` — `HealthModule.forRoot({ checkers })`
3. `src/health/nestjs/index.ts`
4. 단위 테스트 작성 (컨트롤러 응답 코드/바디, 모듈 DI 구성)
5. `npm test` 회귀 확인

### 4단계: Fastify 통합

1. `src/health/fastify/health.plugin.ts` — `fastifyHealth(options)`, `GET /health` 라우트 등록
2. `src/health/fastify/index.ts`
3. 단위 테스트 작성
4. `npm test` 회귀 확인

### 5단계: 패키지 배선 및 최종 검증

1. `tsup.config.ts`의 `modules`에 `'health'` 추가
2. `package.json` exports에 `./health`, `./health/nestjs`, `./health/fastify` 추가 (전체 정렬 재계산, JSON 유효성 검증)
3. `src/index.ts`에 `export * from './health'` 추가
4. `npm test`, `npm run build`(`.d.ts` 정상 생성 확인), `npm run lint` 전체 검증

## 검증 방법

- [ ] `npm test` — 신규 테스트 통과 + 기존 테스트(현재 181개) 회귀 없음
- [ ] `npm run build` — `health` 모듈의 core/nestjs/fastify 3-path가 `.d.ts`까지 정상 생성되는지 확인
- [ ] `npm run lint` — 통과 (기존에 있던 무관한 2건의 lint 에러는 이번 작업 범위 밖)
- [ ] `node -e "JSON.parse(require('fs').readFileSync('package.json'))"` — exports 추가 후 JSON 유효성 확인
- [ ] `buildTraceHeaders`가 traceId/requestId 유무 조합별로 올바른 헤더 객체를 반환하는지 확인
- [ ] `checkHealth`가 정상/비정상 체커를 섞었을 때 `status: 'error'`와 개별 `down` 항목을 올바르게 보고하는지 확인

## 참조 규칙

- `[[api-versioning-module]]` — "옵션은 호출 시점에 명시적으로 전달" 설계 원칙 및 `package.json` exports 전체 재정렬 작업의 기준
- `.claude/CLAUDE.md` — 새 모듈 추가 절차(8단계), `peerDependencies` 원칙, `core` 순수성, 프레임워크 격리 규칙
