## 플랜 실행 이력

### 완료: 2026-06-10

**결과**: 성공

**실제 변경 파일**:
- `src/http/http.options.ts` — `ForgeMetrics` import, `metrics?: ForgeMetrics` 필드 추가
- `src/http/http.ts` — `parseHost` 모듈-수준 헬퍼 추가, `setupMetrics` private 메서드 추가, constructor에서 조건부 호출
- `src/http/http.test.ts` — metrics 관련 테스트 5개 추가 (기존 7 + 신규 5 = 12개)

**계획과의 차이**:
- `recordMetrics` private 헬퍼 메서드는 만들지 않고 response 인터셉터 핸들러 내부에 인라인 처리 (YAGNI)
- `(config as ...)._metricsStart` 에서 leading `;` 제거 — `no-extra-semi` 린트 에러 수정 (`as` 타입 단언 앞이라 ASI 이슈 없음)
- 테스트의 `as [[Function, Function]]` 캐스트를 `as [[(res: unknown) => unknown, (err: unknown) => Promise<unknown>]]`로 수정 — `@typescript-eslint/ban-types` 에러 수정

**잔존 작업**:
없음

---

# outbound-http-metrics — ForgeHttpClient 아웃바운드 요청 자동 계측

## 목표

`ForgeHttpClient`가 외부 서비스로 보내는 모든 HTTP 요청을 Prometheus 메트릭으로 자동 기록한다.
`metrics?: ForgeMetrics` 옵션 하나만 추가하면 요청 수(counter) + 레이턴시(histogram)가 수집되며,
인바운드 메트릭(`http_requests_total`)과 이름이 달라 같은 프로세스에서 충돌이 없다.

## 현재 상태 (AS-IS)

```ts
// src/http/http.options.ts
export interface HttpOptions {
  baseURL?: string
  timeout?: number
  retries?: number
  retryDelay?: number
  headers?: Record<string, string>
  logger?: ForgeLogger   // ← ForgeLogger는 이미 intra-package 의존
}
```

```ts
// src/http/http.ts — 기존 인터셉터 패턴
private setupLogging(logger: ForgeLogger): void {
  this.client.interceptors.request.use(...)   // 요청 로깅
  this.client.interceptors.response.use(...)  // 응답/에러 로깅
}
```

아웃바운드 요청 레이턴시/성공률을 Prometheus로 수집하는 방법이 없다.
서비스 간 의존성 장애 탐지(RED 패턴)가 불가능한 상태.

## 변경 후 상태 (TO-BE)

### HttpOptions 확장

```ts
// src/http/http.options.ts
import type { ForgeMetrics } from '../metrics'

export interface HttpOptions {
  baseURL?: string
  timeout?: number
  retries?: number
  retryDelay?: number
  headers?: Record<string, string>
  logger?: ForgeLogger
  metrics?: ForgeMetrics   // ← 추가
}
```

### setupMetrics 메서드 추가

```ts
// src/http/http.ts
if (options.metrics) {
  this.setupMetrics(options.metrics)
}

private setupMetrics(metrics: ForgeMetrics): void {
  const requestsTotal = metrics.counter({
    name: 'http_outbound_requests_total',
    help: 'Total number of outbound HTTP requests',
    labelNames: ['method', 'host', 'status'],
  })
  const requestDuration = metrics.histogram({
    name: 'http_outbound_request_duration_seconds',
    help: 'Outbound HTTP request duration in seconds',
    labelNames: ['method', 'host', 'status'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  })

  // request interceptor: 시작 시간 기록
  this.client.interceptors.request.use((config) => {
    ;(config as InternalAxiosRequestConfig & { _metricsStart?: number })._metricsStart = Date.now()
    return config
  })

  // response interceptor: 성공/에러 모두 메트릭 기록 후 원래 동작 유지
  this.client.interceptors.response.use(
    (response) => {
      const start = (response.config as InternalAxiosRequestConfig & { _metricsStart?: number })._metricsStart
      this.recordMetrics(requestsTotal, requestDuration, {
        method: response.config.method?.toUpperCase() ?? 'UNKNOWN',
        host: parseHost(response.config.baseURL ?? response.config.url),
        status: String(response.status),
        startMs: start,
      })
      return response
    },
    (error) => {
      const config = error.config as (InternalAxiosRequestConfig & { _metricsStart?: number }) | undefined
      this.recordMetrics(requestsTotal, requestDuration, {
        method: config?.method?.toUpperCase() ?? 'UNKNOWN',
        host: parseHost(config?.baseURL ?? config?.url),
        status: String(error.response?.status ?? 0),
        startMs: config?._metricsStart,
      })
      return Promise.reject(error)
    },
  )
}
```

### 레이블 설계

| 레이블 | 값 | 비고 |
|--------|-----|------|
| `method` | `GET`, `POST`, ... | `config.method.toUpperCase()` |
| `host` | `api.example.com` | `baseURL` 우선, 없으면 `url`에서 hostname 추출, 실패 시 `'unknown'` |
| `status` | `'200'`, `'404'`, ... | 네트워크 에러(응답 없음) 시 `'0'` |

`host` = hostname만 추출 → cardinality 폭발 방지. 경로/쿼리스트링 제외.

### 사용 예시

```ts
const metrics = new ForgeMetrics()
const http = new ForgeHttpClient({
  baseURL: 'https://api.partner.com',
  metrics,
})
// 이후 모든 get/post/... 호출이 http_outbound_requests_total,
// http_outbound_request_duration_seconds에 자동 기록됨
```

## 변경 범위

| 파일 | 변경 내용 |
|------|----------|
| `src/http/http.options.ts` | `metrics?: ForgeMetrics` 추가, `ForgeMetrics` import |
| `src/http/http.ts` | `setupMetrics` private 메서드 추가, constructor에서 조건부 호출, `parseHost` 모듈-수준 헬퍼 추가 |
| `src/http/http.test.ts` | metrics 인터셉터 등록 + 성공/에러 핸들러 동작 테스트 추가 |

## 영향성

| 영향 대상 | 영향 내용 |
|-----------|----------|
| 기존 `ForgeHttpClient` 사용 코드 | 변경 없음 — `metrics` 미전달 시 기존 동작 그대로 |
| `setupLogging` / `setupRetry` | 변경 없음 — 독립 인터셉터로 공존 |
| 인바운드 메트릭 (`http_requests_total`) | 변경 없음 — 이름이 달라 충돌 없음 |
| `src/http/http.options.ts` | `ForgeMetrics` import 추가로 `http → metrics` intra-package 의존 발생 (기존 `http → logger`와 동일 패턴) |

## Breaking Changes

없음 — `metrics`는 선택적 옵션이며 기존 생성자 시그니처와 완전히 호환된다.

## 위험도

**MEDIUM** — 기존 `setupLogging`과 동일한 인터셉터 등록 패턴이라 구조 위험은 낮지만,
`_metricsStart` 커스텀 필드를 `InternalAxiosRequestConfig`에 type assertion으로 붙이는 부분과
인터셉터 등록 순서(retry → logging → metrics)에 따른 side effect를 주의해야 한다.

## 주의사항

- **인터셉터 등록 순서**: axios 인터셉터는 등록 순서대로 실행된다. `setupRetry` → `setupLogging` → `setupMetrics` 순으로 호출하면 retry가 완료된 최종 응답에 메트릭이 찍힌다. retry 시도별로 메트릭을 찍으려면 순서를 바꿔야 하지만, 이 플랜에서는 **최종 결과 기준** 계측을 택한다 (단순함 우선).
- **`_metricsStart` 타입 확장**: `InternalAxiosRequestConfig`는 axios 내부 타입이라 직접 확장이 어렵다. `& { _metricsStart?: number }` 교차 타입으로 type assertion하는 패턴은 기존 `setupRetry`의 `_retryCount`와 동일한 방식이다.
- **`parseHost` 함수**: 모듈 최상단(클래스 외부)에 순수 함수로 배치. 빈 문자열/상대경로 입력 시 `new URL()`이 throw → `'unknown'` fallback.
- **`peerDependencies` vs `dependencies`**: `prom-client`는 `dependencies`에 있으므로 `ForgeMetrics` import는 안전하다. `metrics`는 옵션이므로 `ForgeMetrics` 인스턴스를 직접 new 하지 않는 서비스에는 prom-client가 번들되지 않는다 (tree-shaking 대상).

## 작업 단계

### 1단계: http.options.ts 수정

1. `ForgeMetrics` import type 추가: `import type { ForgeMetrics } from '../metrics'`
2. `HttpOptions`에 `metrics?: ForgeMetrics` 필드 추가

### 2단계: http.ts 수정

1. `parseHost` 순수 헬퍼 함수를 클래스 외부 모듈 수준에 추가:
   ```ts
   function parseHost(url?: string): string {
     if (!url) return 'unknown'
     try {
       return new URL(url).host
     } catch {
       return 'unknown'
     }
   }
   ```
2. `setupMetrics(metrics: ForgeMetrics)` private 메서드 추가 (counter + histogram 생성, request/response 인터셉터 등록)
3. constructor 마지막에 `if (options.metrics) { this.setupMetrics(options.metrics) }` 추가
4. `ForgeMetrics` import type 추가

### 3단계: http.test.ts 테스트 추가

기존 `vi.mock('axios')` 구조를 그대로 활용해 아래 테스트를 추가한다:

1. **등록 확인**: `metrics` 옵션이 주어지면 `request.use` + `response.use`가 호출된다
2. **성공 경로**: response interceptor success 핸들러에서 counter.inc(), histogram.observe()가 올바른 레이블로 호출된다
3. **에러 경로**: response interceptor error 핸들러에서 `status: '0'` (네트워크 에러) 또는 실제 status로 메트릭이 기록되고, 에러가 re-reject된다
4. **host 추출**: `baseURL`이 있을 때 hostname만 label로 사용되는지 확인
5. **metrics 없을 때**: `metrics` 옵션 미전달 시 interceptors.request.use가 추가로 호출되지 않는다

`ForgeMetrics` 모킹은 `counter()` / `histogram()` 반환값을 `{ labels: vi.fn().mockReturnValue({ inc: vi.fn() }) }` 형태로 구성한다.

### 4단계: 전체 검증

1. `npm test` — 신규 테스트 통과 + 기존 테스트 회귀 없음
2. `npm run build` — `dist/http/index.d.ts`에 변경 없음 (public API 변화 없음, `HttpOptions` 타입 변경만)
3. `npm run lint` — 통과 (기존 pre-existing 2건 제외)

## 검증 방법

- [ ] `npm test` — 기존 테스트 전체 통과 + 신규 metrics 테스트 5개 통과
- [ ] `npm run build` — 빌드 성공, `HttpOptions` 타입에 `metrics?: ForgeMetrics` 포함 확인
- [ ] `npm run lint` — 통과 (pre-existing 2건 제외)
- [ ] `metrics` 옵션 없이 생성 시 기존 동작과 완전히 동일한지 확인
- [ ] `http_outbound_requests_total`이 `http_requests_total`과 이름이 달라 Prometheus 레지스트리 충돌 없음 확인
- [ ] `parseHost('https://api.example.com/users/1')` → `'api.example.com'` 확인
- [ ] `parseHost(undefined)` → `'unknown'` 확인

## 참조 규칙

- `[[inbound-request-metrics]]` — `MetricsInterceptor`의 RED 메트릭 패턴(counter + histogram + 레이블 설계) 참조
- `[[cache-hit-miss-metrics]]` — opt-in 옵션 패턴 참조 (`observer?: CacheObserver`)
- `.claude/CLAUDE.md` — `peerDependencies` 원칙: `prom-client`는 `dependencies`에 있어 import 가능
