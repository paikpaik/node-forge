## 플랜 실행 이력

### 완료: 2026-06-13

**결과**: 성공

**실제 변경 파일**:
- `src/core/async.ts` (신규) — `sleep`, `timeout`, `retry`, `mapConcurrent`, `RetryOptions`
- `src/core/async.test.ts` (신규) — 4개 describe, 19개 테스트 (기존 316 + 19 = 335개)
- `src/core/index.ts` — `export * from './async'` 추가

**계획과의 차이**:
- `timeout` 내부 구현을 `sleep` 재사용 대신 직접 `setTimeout`으로 구현 — `sleep`을 재사용하면 rejection 경로에서 `clearTimeout`이 되지 않아 타이머 누수 가능성이 있어 별도 `setTimeout`으로 분리

**잔존 작업**:
없음

---

# core-async — 비동기 제어 유틸

## 목표

비동기 흐름 제어에서 반복적으로 필요한 패턴을 `src/core/async.ts`에 표준화한다.
`sleep`, `timeout`, `retry`, `mapConcurrent` 네 가지로 대부분의 비동기 제어 시나리오를 커버한다.

## 현재 상태 (AS-IS)

`ForgeHttpClient.setupRetry`에는 HTTP 전용 재시도 로직이 있지만 범용 `retry` 함수는 없다.
`sleep`/`timeout`/`mapConcurrent`도 없어 서비스 코드에서 직접 구현 중.

## 변경 후 상태 (TO-BE)

### 신규: `src/core/async.ts`

```ts
// ms만큼 대기
export function sleep(ms: number): Promise<void>

// promise가 ms 안에 완료되지 않으면 reject
export function timeout<T>(promise: Promise<T>, ms: number): Promise<T>

// 재시도 옵션
export interface RetryOptions {
  retries: number       // 최대 재시도 횟수
  delay?: number        // 첫 번째 재시도 전 대기 ms (기본 0)
  factor?: number       // 지수 백오프 배율 (기본 1 = 고정 지연)
  onRetry?: (error: unknown, attempt: number) => void
}
// fn이 reject되면 retries 횟수까지 재시도
export function retry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T>

// arr 요소를 fn으로 처리하되 동시 실행 수를 concurrency로 제한
export function mapConcurrent<T, R>(
  arr: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<R[]>
```

### 사용 예시

```ts
// 폴링
while (!done) {
  await sleep(2_000)
  done = await checkStatus()
}

// 외부 API 호출에 타임아웃
const data = await timeout(fetch(url), 5_000)

// 지수 백오프 재시도
const result = await retry(() => api.call(), {
  retries: 3,
  delay: 200,
  factor: 2,  // 200ms → 400ms → 800ms
})

// 1000개 이미지를 5개씩 병렬 처리
const results = await mapConcurrent(imageUrls, uploadImage, 5)
```

## 변경 범위

| 파일 | 변경 내용 |
|------|----------|
| `src/core/async.ts` (신규) | `sleep`, `timeout`, `retry`, `mapConcurrent` |
| `src/core/async.test.ts` (신규) | 각 함수 테스트 |
| `src/core/index.ts` | `export * from './async'` 추가 |

## 영향성

| 영향 대상 | 영향 내용 |
|-----------|----------|
| `ForgeHttpClient.setupRetry` | 변경 없음 — HTTP 인터셉터 기반이라 범용 `retry`와 별개 |
| 기존 `src/core/*` | 변경 없음 |

## Breaking Changes

없음

## 위험도

**LOW** — 신규 파일 추가, 기존 코드 변경 없음.

## 주의사항

- **`timeout` 취소 불가**: `Promise`는 cancel이 없으므로 timeout이 발생해도 원래 promise는 계속 실행된다. `AbortController`가 필요하면 호출부에서 직접 처리해야 한다. JSDoc에 명시.
- **`retry` 마지막 에러 전파**: 모든 재시도 실패 시 마지막 에러를 그대로 reject한다. 에러 타입이 유지된다.
- **`mapConcurrent` 순서 보장**: 입력 배열과 같은 인덱스 순서로 결과를 반환한다 (`Promise.all`처럼). 하나라도 reject되면 전체가 reject된다.
- **`mapConcurrent` concurrency <= 0**: 에러를 던진다.
- **`factor` 기본값 1**: 기본은 고정 지연. 지수 백오프는 명시적으로 `factor: 2` 이상을 지정해야 한다.

## 작업 단계

### 1단계: async.ts 구현

1. `sleep(ms)` — `new Promise(resolve => setTimeout(resolve, ms))`
2. `timeout<T>(promise, ms)` — `Promise.race([promise, sleep(ms).then(() => { throw new Error(...) })])`
3. `retry<T>(fn, options)` — `while` 루프, 지수 백오프 `delay * factor^attempt`
4. `mapConcurrent<T, R>(arr, fn, concurrency)` — 슬라이딩 윈도우 큐: 동시 실행 수를 유지하며 완료된 자리에 다음 작업을 채운다

### 2단계: 테스트 작성

- `sleep`: ms 후 resolve (정확도는 여유있게 검증)
- `timeout`: ms 안에 완료 시 값 반환, ms 초과 시 reject
- `retry`: 성공까지 재시도 횟수 확인, 모두 실패 시 에러 전파, `onRetry` 콜백 호출 확인
- `mapConcurrent`: 순서 보장, 동시 실행 수 제한 확인, reject 전파

### 3단계: index.ts export 추가

## 검증 방법

- [ ] `npm test` — 신규 테스트 통과 + 기존 회귀 없음
- [ ] `npm run build` — `dist/core/index.d.ts`에 신규 함수 포함
- [ ] `npm run lint` — 통과
- [ ] `mapConcurrent([1..10], asyncFn, 3)` 실행 시 동시에 최대 3개만 실행됨을 테스트로 확인

## 참조 규칙

- `.claude/CLAUDE.md` — `core` 순수성: Node.js 내장 API(`setTimeout`)만 사용, 외부 의존성 없음
