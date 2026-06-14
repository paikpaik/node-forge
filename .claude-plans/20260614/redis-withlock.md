## 플랜 실행 이력

### 완료: 2026-06-14

**결과**: 성공

**실제 변경 파일**:
- `src/redis/redis.ts` — `WithLockOptions` 인터페이스 + `withLock<T>` 메서드 추가, `ForgeError`/`sleep` import 추가
- `src/redis/redis.test.ts` — `describe('withLock')` 7개 테스트 추가 (기존 361 + 7 = 368개)

**계획과의 차이**:
없음

**잔존 작업**:
없음

---

# redis-withlock — withLock 고수준 분산 락 헬퍼

## 목표

`ForgeRedisClient`의 `lock`/`unlock` 원시 메서드 위에 `withLock<T>`을 추가한다.
호출부가 직접 try/finally와 재시도 로직을 작성하지 않아도 되도록 "획득 → 실행 → 해제"를 안전하게 감싸는 것이 목표다.

## 현재 상태 (AS-IS)

`ForgeRedisClient`에 `lock`/`unlock`이 있지만 고수준 래퍼는 없다.

```ts
// 현재 호출부가 직접 짜야 하는 패턴
const token = await redis.lock('job:run', 30)
if (!token) throw new Error('lock 획득 실패')
try {
  await doWork()
} finally {
  await redis.unlock('job:run', token)
}
```

문제점:
- finally 누락 시 락이 TTL까지 잠금 상태로 남는다
- 락 획득 실패 시 재시도 로직을 매번 직접 구현해야 한다
- 에러 처리 방식이 팀마다 달라 일관성이 없다

## 변경 후 상태 (TO-BE)

```ts
// 변경 후 — 획득/해제/재시도를 withLock이 책임진다
const result = await redis.withLock('job:run', 30, async () => {
  return await doWork()
})

// 재시도가 필요한 경우
const result = await redis.withLock('job:run', 30, fn, {
  retries: 5,       // 최대 5회 재시도 (총 6번 시도)
  retryDelay: 100,  // 재시도 간격 100ms
})
```

### 추가 인터페이스

```ts
export interface WithLockOptions {
  /** 락 획득 실패 시 재시도 횟수. 기본값 0 (즉시 실패). */
  retries?: number
  /** 재시도 간격 ms. 기본값 50. */
  retryDelay?: number
}
```

### 에러 동작

모든 재시도가 실패하면 `ForgeError('E9501', ...)` throw.

```ts
throw new ForgeError('E9501', `Failed to acquire lock: ${key}`)
```

## 변경 범위

| 파일 | 변경 내용 |
|------|----------|
| `src/redis/redis.ts` | `WithLockOptions` 인터페이스 + `withLock<T>` 메서드 추가 |
| `src/redis/redis.test.ts` | `withLock` 테스트 추가 (기존 mockClient 재사용) |

## 영향성

| 영향 대상 | 영향 내용 |
|-----------|----------|
| `lock` / `unlock` 메서드 | 변경 없음 — `withLock`이 내부적으로 호출할 뿐 |
| `ForgeError` import | `src/core/errors` import 추가 |
| 기존 테스트 | 변경 없음 |

## Breaking Changes

없음

## 위험도

**LOW** — 기존 `lock`/`unlock` 로직 변경 없음. 메서드와 인터페이스 추가만.

## 주의사항

- **`sleep` import**: `retryDelay` 구현에 `src/core/async`의 `sleep`을 사용한다.
  `redis.ts`에서 core를 import하는 건 단방향 의존성이라 괜찮다 (core는 redis를 모른다).
- **`fn` 실패 vs 락 획득 실패 구분**: `fn()` 자체에서 던진 에러는 `withLock`이 감싸지 않고 그대로 전파한다. `ForgeError('E9501', ...)`은 "락 자체를 못 잡은 경우"에만 던진다.
- **`unlock` 실패 무시**: finally에서 `unlock`이 false를 반환해도(토큰 불일치, 이미 만료) 추가 에러를 던지지 않는다. 락은 TTL에 의해 자동 해제된다.
- **재시도 간 sleep**: `retries > 0`일 때만 sleep이 발생한다. `retries: 0`이면 sleep 없이 즉시 실패.

## 작업 단계

### 1단계: redis.ts 수정

1. `import { ForgeError } from '../core/errors'` 추가
2. `import { sleep } from '../core/async'` 추가
3. `WithLockOptions` 인터페이스 `// ── 분산 락 ──` 섹션 상단에 추가
4. `withLock<T>` 메서드 구현:
   - for 루프 (`0 ~ retries`)로 `lock()` 시도
   - 획득 성공 시 try/finally로 `fn()` 실행 → `unlock()`
   - 실패 시 마지막 시도가 아니면 `sleep(retryDelay)` 후 재시도
   - 모든 시도 실패 시 `ForgeError('E9501', ...)` throw

### 2단계: redis.test.ts 테스트 추가

`describe('withLock')` 블록 추가:

- 락 획득 성공 → fn 결과 반환
- fn 실행 후 unlock이 호출된다
- fn이 에러 던지면 unlock 후 에러를 그대로 전파한다
- 락 획득 실패 → ForgeError('E9501') throw
- retries > 0이면 지정 횟수만큼 재시도 후 실패
- 재시도 중 성공하면 fn 결과 반환

## 검증 방법

- [ ] `npm test` — 신규 `withLock` 테스트 통과 + 기존 361개 회귀 없음
- [ ] `npm run build` — 빌드 성공
- [ ] `npm run lint` — 통과
- [ ] `withLock('key', 30, fn)` 호출 시 fn 성공 → 결과 반환, fn 실패 → 에러 전파, 락 경합 → E9501 확인

## 참조 규칙

- `.claude/CLAUDE.md` — `peerDependencies` 원칙: ioredis는 peer, core import는 허용
- `.claude/CLAUDE.md` — 에러 코드: `E95xx` 서버/인프라 오류
