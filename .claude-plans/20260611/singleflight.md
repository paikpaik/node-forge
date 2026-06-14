## 플랜 실행 이력

### 완료: 2026-06-11

**결과**: 성공

**실제 변경 파일**:
- `src/redis/redis.options.ts` — `singleflight?: boolean` 필드 + JSDoc 추가
- `src/redis/redis.ts` — `_singleflight`, `_inflight` 필드 추가; `dedupe` private 메서드 추가; `getOrSet`/`cGetOrSet`의 fetch+set 블록을 `dedupe`로 감싸기
- `src/redis/redis.test.ts` — singleflight 테스트 4개 추가 (기존 113 + 신규 4 = 117개 → 총 247개)

**계획과의 차이**:
없음 — 설계 그대로 구현됨

**잔존 작업**:
없음

---

# singleflight — 동시 캐시 miss 시 fetchFn 중복 실행 방지

## 목표

캐시 키가 만료된 직후 여러 요청이 동시에 들어올 때, `fetchFn`(DB 조회 등)을 한 번만 실행하고 나머지는 그 결과를 공유하게 한다.
Redis thundering herd 문제를 외부 락 없이 프로세스 내 인메모리 Map으로 해결한다.
`singleflight: true` 옵션 하나만 추가하면 활성화되고, 기본값은 비활성화라 기존 동작에 영향 없다.

## 현재 상태 (AS-IS)

```ts
// src/redis/redis.ts — getOrSet
async getOrSet<T>(key, fetchFn, expireSeconds?): Promise<T> {
  const cached = await this.get<T>(key)
  if (cached !== null) {
    this.observer?.onHit()
    return cached
  }
  this.observer?.onMiss()
  const fresh = await fetchFn()          // ← 동시에 10개가 여기 도달하면 10번 실행
  await this.set(key, fresh, expireSeconds)
  return fresh
}
```

```ts
// src/redis/redis.options.ts
export interface RedisOptions {
  host?: string; port?: number; /* ... */
  observer?: CacheObserver        // ← singleflight 관련 옵션 없음
}
```

캐시 만료 순간 동시 요청이 몰리면 `fetchFn`이 N번 중복 실행된다. DB 쿼리라면 N배 부하, 외부 API 호출이라면 N배 과금이 발생한다.

## 변경 후 상태 (TO-BE)

### RedisOptions 확장

```ts
export interface RedisOptions {
  // ...기존 필드...
  observer?: CacheObserver
  singleflight?: boolean   // ← 추가. 기본값 false
}
```

### dedupe 헬퍼 메서드

```ts
// ForgeRedisClient 내부
private readonly _singleflight: boolean
private readonly _inflight = new Map<string, Promise<unknown>>()

private dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (!this._singleflight) return fn()

  const existing = this._inflight.get(key)
  if (existing) return existing as Promise<T>

  const promise = fn().finally(() => {
    this._inflight.delete(key)
  })
  this._inflight.set(key, promise)
  return promise
}
```

### getOrSet/cGetOrSet 수정 — fetch+set을 dedupe로 감싸기

```ts
async getOrSet<T>(key, fetchFn, expireSeconds?): Promise<T> {
  const cached = await this.get<T>(key)
  if (cached !== null) {
    this.observer?.onHit()
    return cached
  }
  this.observer?.onMiss()
  return this.dedupe(key, async () => {
    const fresh = await fetchFn()
    await this.set(key, fresh, expireSeconds)
    return fresh
  })
}
```

### 사용 예시

```ts
// singleflight 비활성화 (기본) — 기존 동작 그대로
const redis = new ForgeRedisClient({ host: 'localhost' })

// singleflight 활성화 — 동시 miss 시 fetchFn 1회만 실행
const redis = new ForgeRedisClient({ host: 'localhost', singleflight: true })

// 동시 10개 요청: fetchFn은 1회만 실행, 모두 같은 결과 반환
const results = await Promise.all(
  Array.from({ length: 10 }, () =>
    redis.getOrSet('user:1', () => db.findUser(1), 60),
  ),
)
```

## 변경 범위

| 파일 | 변경 내용 |
|------|----------|
| `src/redis/redis.options.ts` | `singleflight?: boolean` 필드 추가 |
| `src/redis/redis.ts` | `_singleflight` boolean, `_inflight` Map, `dedupe` private 메서드 추가; `getOrSet`/`cGetOrSet`에서 fetch+set을 `dedupe`로 감싸기 |
| `src/redis/redis.test.ts` | singleflight 동작 테스트 추가 |

## 영향성

| 영향 대상 | 영향 내용 |
|-----------|----------|
| 기존 `ForgeRedisClient` 사용 코드 | 변경 없음 — `singleflight` 미전달 시 `dedupe`가 `fn()`을 그대로 호출 |
| `getOrSet` / `cGetOrSet` 시그니처 | 변경 없음 — 기존 파라미터 그대로 |
| `CacheObserver` / `observer` | 변경 없음 — `onMiss()`는 cache miss 시 기존과 동일하게 호출 |
| `lock` / `unlock` 등 다른 메서드 | 변경 없음 |

## Breaking Changes

없음 — `singleflight` 기본값이 `false`이므로 기존 동작과 완전히 동일하다.

## 위험도

**MEDIUM** — `getOrSet`/`cGetOrSet`의 내부 실행 순서가 바뀌지만 singleflight 비활성화 시 동일한 코드 경로. 핵심 위험은 `_inflight` Map의 누수: `fetchFn`이 reject될 때 `.finally()`로 Map을 정리하지 않으면 이후 같은 키에 대한 요청이 영원히 막힌다.

## 주의사항

- **`finally` 보장**: `dedupe`에서 `fn().finally(() => this._inflight.delete(key))`로 성공/실패 모두 Map을 정리해야 한다. 실패 시에도 정리해야 다음 요청이 재시도할 수 있다.
- **`observer.onMiss()` 호출 횟수**: singleflight 활성화 시 동시 miss N개가 들어오면 `onMiss()`는 N번 모두 호출된다 (캐시 조회 결과가 null인 것은 각 요청 모두 해당). `fetchFn`이 1번만 실행되는 것과 별개다. hit율 계산에는 이 점을 감안해야 한다.
- **단일 프로세스 범위**: `_inflight` Map은 프로세스 내 메모리다. Node.js 클러스터나 PM2 멀티 프로세스 환경에서는 프로세스 간 중복 실행을 막지 않는다. 다중 프로세스 환경까지 보호하려면 Redis 분산 락(기존 `lock`/`unlock`)을 별도로 조합해야 한다.
- **`expireSeconds` 일관성**: 동시 요청이 서로 다른 `expireSeconds`를 전달하면 첫 번째 요청의 값이 사용된다. 같은 키에 다른 TTL을 쓰는 패턴은 singleflight와 맞지 않다.
- **`cGetOrSet`의 singleflight 키**: `cGetOrSet(key, compareKey, fetchFn, expireSeconds)`에서 `_inflight`의 키는 데이터 키(`key`)를 사용한다. `compareKey`가 같아도 데이터 키가 다르면 별도의 inflight로 취급된다.

## 작업 단계

### 1단계: redis.options.ts 수정

1. `singleflight?: boolean` 필드 추가 및 JSDoc 작성

### 2단계: redis.ts 수정

1. `constructor`에서 `this._singleflight = options.singleflight ?? false` 초기화
2. `private readonly _inflight = new Map<string, Promise<unknown>>()` 필드 추가
3. `private dedupe<T>(key: string, fn: () => Promise<T>): Promise<T>` 메서드 추가:
   - `!this._singleflight` → `fn()` 바로 반환
   - `_inflight.get(key)` 존재 시 → 기존 Promise 반환
   - 신규 → `fn().finally(() => this._inflight.delete(key))` 생성 후 Map 저장, 반환
4. `getOrSet`에서 `fetchFn()` + `this.set(...)` 호출 부분을 `this.dedupe(key, async () => { ... })`로 감싸기
5. `cGetOrSet`도 동일하게 수정

### 3단계: redis.test.ts 테스트 추가

기존 mock 패턴(`vi.mock('ioredis')`)을 활용해 아래 테스트를 추가한다:

1. **`fetchFn` 1회 보장**: `singleflight: true`로 동시에 `getOrSet` 3번 호출 시 `fetchFn`이 1번만 실행되고 모두 같은 값을 반환한다
2. **결과 공유**: `Promise.all`로 3개 동시 호출 결과가 전부 동일한 값이다
3. **실패 후 재시도**: `fetchFn`이 reject되면 `_inflight`에서 키가 제거되어 다음 호출이 정상 실행된다
4. **비활성화 시 기존 동작**: `singleflight` 미전달(기본값 false)이면 동시 miss 시 `fetchFn`을 각각 실행한다
5. **`cGetOrSet`도 동일**: singleflight 활성화 시 `cGetOrSet` 동시 호출에서도 `fetchFn` 1회만 실행된다

## 검증 방법

- [ ] `npm test` — 신규 테스트 통과 + 기존 테스트(현재 243개) 회귀 없음
- [ ] `npm run build` — `RedisOptions`에 `singleflight?: boolean` 포함 확인
- [ ] `npm run lint` — 통과 (pre-existing 2건 제외)
- [ ] singleflight 미전달 시 `getOrSet`/`cGetOrSet` 기존 동작과 완전히 동일한지 확인
- [ ] `fetchFn` reject 후 다음 호출에서 재실행되는지 확인 (Map 누수 없음)

## 참조 규칙

- `[[cache-hit-miss-metrics]]` — `observer` opt-in 패턴 참조 (같은 `RedisOptions` 확장 방식)
- `.claude/CLAUDE.md` — `core` 순수성과 무관, redis 모듈 내부 변경만
