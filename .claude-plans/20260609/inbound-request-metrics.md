## 플랜 실행 이력

### 완료: 2026-06-10

**결과**: 성공

**실제 변경 파일**:
- `src/metrics/nestjs/metrics.interceptor.ts` (신규) — `MetricsInterceptor` 구현. `@Inject(METRICS_INSTANCE)`로 `ForgeMetrics` 주입, constructor에서 `http_requests_total` counter + `http_request_duration_seconds` histogram 생성, `intercept()`에서 `tap`(정상) + `catchError`(에러, 재-throw)로 duration/status 기록
- `src/metrics/nestjs/metrics.interceptor.test.ts` (신규) — 정상 응답 계측, 에러 status 기록 + 재-throw, status 없는 예외 → 500, route 없음 → url fallback 등 5개 테스트
- `src/metrics/nestjs/index.ts` — `export * from './metrics.interceptor'` 추가
- `src/metrics/fastify/metrics.plugin.ts` — `FastifyMetricsOptions` 인터페이스 추가(`httpMetrics?: boolean`), `FastifyRequest.startTime` 타입 선언, `httpMetrics: true` 시 `decorateRequest('startTime', 0)` + `onRequest`/`onResponse` 훅 등록
- `src/metrics/fastify/metrics.plugin.test.ts` (신규) — httpMetrics 없음/false/true 옵션별 훅 등록 여부, startTime 기록, onResponse counter/histogram 호출, routeOptions.url 없을 때 unknown fallback 등 6개 테스트

**계획과의 차이**:
`request.routerPath` 대신 `request.routeOptions.url`을 사용했다 — Fastify v5에서 `routerPath`가 제거되고 `routeOptions.url`로 대체됐기 때문. 플랜 작성 시점에 v5 API 변경 사항이 반영되지 않았으나 빌드 에러에서 바로 발견해 수정. 최종적으로 `npm test`(214개, 기존 203 + 신규 11 모두 통과), `npm run build`(`.d.ts` 정상 생성), `npm run lint` 수행. lint 에러 2건(`events.explorer.ts`, `versioning.plugin.ts`)은 기존 pre-existing 이슈.

**잔존 작업**:
없음

---

# inbound-request-metrics — 인바운드 HTTP 요청 latency/status 자동 계측

## 목표

NestJS Interceptor와 Fastify hook을 통해 인바운드 HTTP 요청의 처리 시간(histogram)과 상태 코드(counter)를 `ForgeMetrics`에 자동으로 기록한다. 지금은 사용자가 매 라우트마다 직접 `histogram.observe()`를 호출해야 하는데, 이를 한 번 등록으로 앱 전체에 적용할 수 있게 해 서비스 모니터링의 핵심 지표인 RED(Rate, Error, Duration)를 자동으로 수집한다.

## 현재 상태 (AS-IS)

```ts
// metrics.ts — counter/gauge/histogram/summary 생성 도구만 있음
// metrics/nestjs/ — MetricsController(/metrics 노출)만 있고 인터셉터 없음
// metrics/fastify/ — metricsPlugin이 /metrics 라우트만 등록하고 요청 계측 훅 없음
```

사용자가 개별 라우트 레벨에서 직접 계측해야 하며, 공통 패턴이 없어 빠뜨리거나 코드가 분산된다:

```ts
// 현재 — 매 핸들러마다 직접 호출
async getUser(id: string) {
  const start = Date.now()
  try {
    const user = await this.userService.find(id)
    this.histogram.observe({ route: '/users/:id', status: '200' }, (Date.now() - start) / 1000)
    return user
  } catch (e) {
    this.histogram.observe({ route: '/users/:id', status: '500' }, (Date.now() - start) / 1000)
    throw e
  }
}
```

## 변경 후 상태 (TO-BE)

공통 메트릭 이름: Prometheus HTTP 관례인 `http_requests_total`(counter)과 `http_request_duration_seconds`(histogram). 라벨은 `{ method, route, status }` — `route`는 등록된 경로 패턴(예: `/users/:id`)을 사용해 카디널리티 폭발을 방지한다.

### NestJS — MetricsInterceptor

```ts
// src/metrics/nestjs/metrics.interceptor.ts
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(@Inject(METRICS_INSTANCE) metrics: ForgeMetrics) {
    // constructor에서 counter/histogram 한 번만 생성
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const start = Date.now()
    const req = context.switchToHttp().getRequest()
    const res = context.switchToHttp().getResponse()
    const method = req.method as string
    const route = (req.route?.path ?? req.url ?? 'unknown') as string

    return next.handle().pipe(
      tap(() => this.record(method, route, String(res.statusCode), start)),
      catchError((err: unknown) => {
        const status = String((err as { status?: number }).status ?? 500)
        this.record(method, route, status, start)
        throw err
      }),
    )
  }
}
```

앱 전체 적용은 `APP_INTERCEPTOR`로 등록:
```ts
// 사용자 앱 AppModule
providers: [{ provide: APP_INTERCEPTOR, useClass: MetricsInterceptor }]
```

### Fastify — metricsPlugin 훅 확장

```ts
// metrics.plugin.ts 옵션 확장
export interface FastifyMetricsOptions extends MetricsOptions {
  httpMetrics?: boolean  // 기본값 false — opt-in
}

// onRequest + onResponse 훅으로 자동 계측
fastify.decorateRequest('startTime', 0)
fastify.addHook('onRequest', (request, _reply, done) => {
  request.startTime = Date.now()
  done()
})
fastify.addHook('onResponse', (request, reply, done) => {
  const duration = (Date.now() - request.startTime) / 1000
  const route = request.routerPath ?? request.url
  requestDuration.labels({ method: request.method, route, status: String(reply.statusCode) }).observe(duration)
  requestsTotal.labels({ method: request.method, route, status: String(reply.statusCode) }).inc()
  done()
})
```

## 변경 범위

| 파일 | 변경 내용 |
|------|----------|
| `src/metrics/nestjs/metrics.interceptor.ts` (신규) | `MetricsInterceptor` — RxJS `tap`/`catchError`로 요청 계측 |
| `src/metrics/nestjs/metrics.interceptor.test.ts` (신규) | `MetricsInterceptor` 단위 테스트 |
| `src/metrics/nestjs/index.ts` | `MetricsInterceptor` re-export 추가 |
| `src/metrics/fastify/metrics.plugin.ts` | `FastifyMetricsOptions` 확장, `decorateRequest('startTime')`, `onRequest`/`onResponse` 훅 추가 (httpMetrics: true 시에만) |
| `src/metrics/fastify/metrics.plugin.test.ts` (신규) | Fastify httpMetrics 훅 단위 테스트 |

## 영향성

| 영향 대상 | 영향 내용 |
|-----------|----------|
| 기존 `MetricsModule`/`MetricsController` | 변경 없음 — `MetricsInterceptor`는 별도 파일, 사용자가 명시적으로 `APP_INTERCEPTOR`로 등록해야 적용됨 |
| 기존 `fastifyMetrics` 동작 | 변경 없음 — `httpMetrics` 옵션 기본값이 `false`(opt-in)이므로 기존 등록 코드 수정 불필요 |
| `FastifyRequest` 인터페이스 | `startTime?: number` 필드가 추가됨 (`decorateRequest`로 등록, `httpMetrics: false`면 실제 값 없음) |
| `rxjs` peerDependency | 변경 없음 — 이미 `peerDependencies`에 있고 `response.interceptor.ts`에서 사용 중 |

## Breaking Changes

없음 — 모든 변경이 opt-in(NestJS는 `APP_INTERCEPTOR` 등록, Fastify는 `httpMetrics: true` 옵션)이라 기존 코드를 건드리지 않아도 된다.

## 위험도

**LOW** — 기존 모듈의 핵심 로직(메트릭 생성, `/metrics` 엔드포인트)은 변경 없음. 신규 파일 추가와 Fastify plugin의 선택적 훅 추가가 전부.

## 주의사항

- **route 라벨 카디널리티**: `route`에 실제 URL(`/users/123`)이 들어가면 Prometheus에 카디널리티 폭발이 발생한다. NestJS는 `req.route?.path`(등록된 패턴), Fastify는 `request.routerPath`(등록된 패턴)를 사용한다. 패턴을 찾지 못하는 경우(404 등)는 `'unknown'`으로 처리해 실제 URL이 레이블로 들어가지 않게 한다.
- **MetricsInterceptor 중복 생성 방지**: NestJS DI가 `METRICS_INSTANCE`를 싱글톤으로 관리하므로 `ForgeMetrics` 인스턴스는 하나다. `counter`/`histogram`은 constructor에서 한 번만 생성된다. prom-client는 같은 레지스트리에 동일 이름 메트릭을 두 번 등록하면 에러를 발생시키므로, 인터셉터가 여러 번 instantiate되는 환경(테스트)에서는 각 테스트마다 새 `ForgeMetrics` 인스턴스를 사용해야 한다.
- **NestJS 실행 순서**: 인터셉터의 `catchError`에서 에러를 재-throw하면 `ExceptionFilter`가 처리한다. 메트릭 기록 후 반드시 `throw err`로 재-throw해야 에러 응답이 정상 반환된다.
- **Fastify `decorateRequest('startTime', 0)`**: `httpMetrics: false`일 때도 `decorateRequest`가 호출되면 불필요한 메모리를 쓰므로, `if (options.httpMetrics)` 블록 안에서만 선언한다.

## 작업 단계

### 1단계: MetricsInterceptor (NestJS)

1. `src/metrics/nestjs/metrics.interceptor.ts` 작성:
   - `@Injectable()` 데코레이터
   - constructor에서 `@Inject(METRICS_INSTANCE)`로 `ForgeMetrics` 주입, `http_requests_total` counter, `http_request_duration_seconds` histogram 생성 (buckets: `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]`)
   - `private record(method, route, status, start)` 헬퍼 메서드 — duration 계산 + counter/histogram 기록
   - `intercept()` — `tap` (정상) + `catchError` (에러, 재-throw) 로 `record` 호출
   - `@description` JSDoc
2. `src/metrics/nestjs/index.ts`에 `export * from './metrics.interceptor'` 추가
3. `npm test` 회귀 확인

### 2단계: MetricsInterceptor 테스트

1. `src/metrics/nestjs/metrics.interceptor.test.ts` 작성:
   - 정상 응답 시 `record` 호출 확인 (counter inc, histogram observe)
   - 예외 발생 시 에러 status 기록 + 에러 재-throw 확인
   - observer 없는 기존 interceptor와 독립적으로 동작하는지 확인
2. `npm test` 회귀 확인

### 3단계: Fastify httpMetrics 훅

1. `src/metrics/fastify/metrics.plugin.ts` 수정:
   - `FastifyMetricsOptions` 인터페이스 추가 (`MetricsOptions` + `httpMetrics?: boolean`)
   - `declare module 'fastify'`에 `FastifyRequest.startTime?: number` 추가
   - `if (options.httpMetrics)` 블록 내: `decorateRequest('startTime', 0)`, `addHook('onRequest', ...)`, `addHook('onResponse', ...)` 추가
   - counter/histogram 생성, 표준 라벨(`method, route, status`) 사용
   - `route = request.routerPath ?? 'unknown'` (실제 URL 사용 금지)
2. `src/metrics/fastify/metrics.plugin.test.ts` 작성
3. `npm test` 회귀 확인

### 4단계: 최종 검증

1. `npm test` 전체
2. `npm run build` — `MetricsInterceptor` `.d.ts` 정상 생성 확인
3. `npm run lint` — 통과 확인

## 검증 방법

- [ ] `npm test` — 신규 테스트 통과 + 기존 테스트(현재 203개) 회귀 없음
- [ ] `npm run build` — `dist/metrics/nestjs/index.d.ts`에 `MetricsInterceptor` export 포함
- [ ] `MetricsInterceptor` — 정상 응답 시 `http_requests_total{method,route,status}` inc, `http_request_duration_seconds` observe 확인
- [ ] `MetricsInterceptor` — 예외 발생 시 에러 status로 기록되고 에러가 재-throw되는지 확인
- [ ] Fastify `httpMetrics: true` 옵션 — `onResponse` 훅에서 duration/status 기록 확인
- [ ] Fastify `httpMetrics: false`(기본) — 훅 없이 기존 동작 그대로인지 확인

## 참조 규칙

- `.claude/CLAUDE.md` — 프레임워크 격리 규칙: `MetricsInterceptor`는 `nestjs/`에만, Fastify 훅은 `fastify/`에만 배치
- `[[cache-hit-miss-metrics]]` — opt-in 설계 원칙: 인터셉터도 `APP_INTERCEPTOR` 명시 등록, Fastify도 `httpMetrics: true` 옵션으로 opt-in
