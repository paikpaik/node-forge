## 플랜 실행 이력

### 완료: 2026-06-14

**결과**: 성공

**실제 변경 파일**:
- `src/core/circuit-breaker.ts` (신규) — `ForgeCircuitBreaker`, `CircuitBreakerOptions`, `CircuitState`
- `src/core/circuit-breaker.test.ts` (신규) — 16개 테스트 (기존 368 + 16 = 384개)
- `src/core/index.ts` — `export * from './circuit-breaker'` 추가

**계획과의 차이**:
없음

**잔존 작업**:
없음

---

# core-circuit-breaker — 서킷 브레이커

## 목표

외부 서비스 호출 실패가 연쇄적으로 전파되는 것을 막는 `ForgeCircuitBreaker` 클래스를 `src/core/`에 추가한다.
외부 의존성 없이 순수 TypeScript로 구현하며, NestJS/Fastify 모두에서 사용 가능하다.

## 현재 상태 (AS-IS)

`ForgeHttpClient`에 axios 레벨의 재시도(`setupRetry`)는 있지만, 연속 실패 시 요청 자체를
빠르게 차단하는 서킷 브레이커는 없다. 외부 API가 느리거나 다운됐을 때 타임아웃이 쌓여
스레드/커넥션 풀을 소진하는 상황이 발생할 수 있다.

## 변경 후 상태 (TO-BE)

### 신규: `src/core/circuit-breaker.ts`

```ts
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export interface CircuitBreakerOptions {
  /** OPEN으로 전환할 연속 실패 횟수 */
  failureThreshold: number
  /** OPEN 상태를 유지할 ms — 이후 HALF_OPEN으로 전환해 복구를 시도한다 */
  resetTimeout: number
  /** HALF_OPEN에서 CLOSED로 전환할 연속 성공 횟수. 기본값 1 */
  successThreshold?: number
  /** 상태 전환 시 호출되는 콜백. 로깅·메트릭 연결에 사용한다 */
  onStateChange?: (from: CircuitState, to: CircuitState) => void
}

export class ForgeCircuitBreaker {
  constructor(options: CircuitBreakerOptions)

  /** fn을 실행한다. OPEN 상태이면 fn을 호출하지 않고 ForgeError('E9502')를 던진다 */
  execute<T>(fn: () => Promise<T>): Promise<T>

  /** 현재 서킷 상태를 반환한다 */
  getState(): CircuitState

  /** 서킷을 강제로 CLOSED로 초기화한다 */
  reset(): void
}
```

### 상태 전환 규칙

```
CLOSED  ──[failureThreshold회 연속 실패]──▶  OPEN
OPEN    ──[resetTimeout ms 경과 후 execute]──▶  HALF_OPEN
HALF_OPEN ──[successThreshold회 연속 성공]──▶  CLOSED
HALF_OPEN ──[실패 1회]──────────────────────▶  OPEN
```

### 사용 예시

```ts
const cb = new ForgeCircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 30_000,
  successThreshold: 2,
  onStateChange: (from, to) => logger.warn({ from, to }, 'circuit state changed'),
})

// 매 호출마다 execute에 fn을 전달
const data = await cb.execute(() => httpClient.get('/api/products'))
```

### 에러 코드

OPEN 상태에서 요청 차단 시: `ForgeError('E9502', 'Circuit is open: {name}')`

## 변경 범위

| 파일 | 변경 내용 |
|------|----------|
| `src/core/circuit-breaker.ts` (신규) | `ForgeCircuitBreaker`, `CircuitBreakerOptions`, `CircuitState` |
| `src/core/circuit-breaker.test.ts` (신규) | 상태 전환 + execute 동작 테스트 |
| `src/core/index.ts` | `export * from './circuit-breaker'` 추가 |

## 영향성

| 영향 대상 | 영향 내용 |
|-----------|----------|
| `ForgeHttpClient` | 변경 없음 — 호출부에서 `ForgeCircuitBreaker`를 선택적으로 감싸 사용 |
| 기존 `src/core/*` | 변경 없음 |

## Breaking Changes

없음

## 위험도

**LOW** — 신규 파일 추가. 기존 코드 변경은 `index.ts` export 한 줄뿐.

## 주의사항

- **`execute`에서 fn을 받는 설계**: 생성자에서 fn을 고정하지 않고 `execute(fn)`으로 받는다.
  같은 외부 서비스에 대한 여러 엔드포인트 호출을 하나의 서킷으로 묶을 수 있어 더 유연하다.
- **HALF_OPEN 동시 요청**: HALF_OPEN에서 동시에 여러 요청이 들어오면 모두 통과한다.
  `successThreshold`번 연속 성공해야 CLOSED, 어느 하나라도 실패하면 즉시 OPEN.
  분산 환경의 동시성 제어는 이 수준에서 다루지 않는다 (단일 프로세스 가정).
- **실패 카운터 전략**: 연속 실패 카운트. 성공 시 카운터를 0으로 초기화한다.
  시간 윈도우 방식이 필요하면 호출부에서 직접 구현하도록 유도한다.
- **`name` 옵션**: `ForgeError` 메시지에 서킷 식별자를 포함시키기 위해
  `options.name?: string`을 추가한다. 없으면 `'circuit'`을 기본값으로 사용.

## 작업 단계

### 1단계: circuit-breaker.ts 구현

1. `CircuitState` 타입, `CircuitBreakerOptions` 인터페이스 export
2. `ForgeCircuitBreaker` 클래스 구현:
   - 멤버: `state`, `failures`, `successes`, `openedAt`, `options`
   - `execute<T>(fn)`:
     - OPEN이면 → resetTimeout 경과 여부 확인 → 경과했으면 HALF_OPEN 전환 후 진행, 아니면 throw
     - fn 실행 → 성공 시 `onSuccess()`, 실패 시 `onFailure()` 후 에러 재throw
   - `onSuccess()`: failures=0, HALF_OPEN이면 successes++ → successThreshold 도달 시 CLOSED 전환
   - `onFailure()`: failures++, HALF_OPEN이면 즉시 OPEN 전환, CLOSED이면 failureThreshold 도달 시 OPEN 전환
   - `transition(to)`: state 변경 + 카운터 초기화 + onStateChange 콜백 호출
   - `getState()`: `this.state` 반환 (사이드이펙트 없음)
   - `reset()`: `transition('CLOSED')` 호출

### 2단계: 테스트 작성

- CLOSED → OPEN: failureThreshold회 연속 실패 시 전환
- OPEN에서 execute 시 ForgeError(E9502) throw
- OPEN → HALF_OPEN: resetTimeout 경과 후 execute 시 전환 (fake timer 사용)
- HALF_OPEN → CLOSED: successThreshold회 연속 성공 시 전환
- HALF_OPEN → OPEN: 실패 1회 시 즉시 전환
- CLOSED에서 성공하면 실패 카운터가 초기화된다
- onStateChange 콜백이 전환마다 호출된다
- reset()이 CLOSED로 강제 초기화한다

### 3단계: index.ts export 추가

## 검증 방법

- [ ] `npm test` — 신규 테스트 통과 + 기존 368개 회귀 없음
- [ ] `npm run build` — `dist/core/index.d.ts`에 `ForgeCircuitBreaker` 포함
- [ ] `npm run lint` — 통과
- [ ] `failureThreshold: 3`으로 3번 실패 → OPEN, `resetTimeout` 경과 → HALF_OPEN, 성공 → CLOSED 흐름 테스트로 확인

## 참조 규칙

- `.claude/CLAUDE.md` — `core` 순수성: 외부 런타임 의존성 없음
- `.claude/CLAUDE.md` — 에러 코드: `E95xx` 서버/인프라 오류 → `E9502` 사용
