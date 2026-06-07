# redis-module-enhancement — ForgeRedisClient 자료구조별 메서드 및 랭킹 시스템 구현

## 플랜 실행 이력

### 완료: 2026-06-06

**결과**: 성공

**실제 변경 파일**:
- `src/redis/redis.ts` — 3개 → 41개 메서드 추가. 각 메서드에 @description JSDoc 추가
- `src/redis/redis.test.ts` — 5개 → 90개 테스트 (전체 150개 통과)

**계획과의 차이**:
없음 — 9단계 전부 계획대로 완료

**잔존 작업**:
없음

---

## 목표

현재 `ping/getClient/disconnect` 3개뿐인 `ForgeRedisClient`에 Redis의 주요 자료구조별 메서드를 추가한다.
docs/redis/index.ts를 참조해 비교키 기반 캐시 무효화(`cGet/cGetOrSet/invalidate`) 패턴을 포함하고,
Sorted Set을 활용한 랭킹 시스템 헬퍼까지 제공해 MySQL 대비 O(log N) 랭킹 조회를 지원한다.

## 현재 상태 (AS-IS)

```ts
// src/redis/redis.ts — 메서드 3개
class ForgeRedisClient {
  async ping(): Promise<boolean>
  getClient(): Redis
  async disconnect(): Promise<void>
}
```

테스트: 5개 (연결/옵션 테스트만 존재)

## 변경 후 상태 (TO-BE)

```ts
class ForgeRedisClient {
  // ── String ──────────────────────────────────────────────
  async get<T>(key: string): Promise<T | null>
  async set(key: string, value: unknown, expireSeconds?: number): Promise<void>
  async del(...keys: string[]): Promise<number>
  async exists(...keys: string[]): Promise<number>
  async expire(key: string, seconds: number): Promise<boolean>
  async ttl(key: string): Promise<number>
  async mget<T>(keys: string[]): Promise<(T | null)[]>

  // ── Cache-aside & 비교키 무효화 ─────────────────────────
  async getOrSet<T>(key: string, fetchFn: () => Promise<T>, expireSeconds?: number): Promise<T>
  async cGet<T>(key: string, compareKey: string): Promise<T | null>
  async cGetOrSet<T>(key: string, compareKey: string, fetchFn: () => Promise<T>, expireSeconds?: number): Promise<T>
  async invalidate(compareKey: string): Promise<void>

  // ── Counter ─────────────────────────────────────────────
  async incr(key: string): Promise<number>
  async decr(key: string): Promise<number>
  async incrby(key: string, increment: number): Promise<number>
  async decrby(key: string, decrement: number): Promise<number>

  // ── Hash ────────────────────────────────────────────────
  async hget<T>(key: string, field: string): Promise<T | null>
  async hset(key: string, field: string, value: unknown): Promise<void>
  async hmset(key: string, data: Record<string, unknown>): Promise<void>
  async hgetall<T>(key: string): Promise<Record<string, T> | null>
  async hdel(key: string, ...fields: string[]): Promise<number>
  async hexists(key: string, field: string): Promise<boolean>
  async hincrby(key: string, field: string, increment: number): Promise<number>

  // ── List ────────────────────────────────────────────────
  async lpush(key: string, ...values: unknown[]): Promise<number>
  async rpush(key: string, ...values: unknown[]): Promise<number>
  async lpop<T>(key: string, count?: number): Promise<T | null>
  async rpop<T>(key: string, count?: number): Promise<T | null>
  async lrange<T>(key: string, start: number, stop: number): Promise<T[]>
  async llen(key: string): Promise<number>

  // ── Set ─────────────────────────────────────────────────
  async sadd(key: string, ...members: string[]): Promise<number>
  async srem(key: string, ...members: string[]): Promise<number>
  async smembers(key: string): Promise<string[]>
  async scard(key: string): Promise<number>
  async sismember(key: string, member: string): Promise<boolean>

  // ── Sorted Set (랭킹 기반) ──────────────────────────────
  async zadd(key: string, entries: { score: number; member: string }[]): Promise<number>
  async zrem(key: string, ...members: string[]): Promise<number>
  async zscore(key: string, member: string): Promise<number | null>
  async zincrby(key: string, member: string, increment: number): Promise<number>
  async zrank(key: string, member: string): Promise<number | null>       // 오름차순
  async zrevrank(key: string, member: string): Promise<number | null>    // 내림차순 (랭킹)
  async zrange<T = string>(key: string, start: number, stop: number): Promise<T[]>
  async zrevrange<T = string>(key: string, start: number, stop: number): Promise<T[]>
  async zrangeWithScores(key: string, start: number, stop: number): Promise<{ member: string; score: number }[]>
  async zrevrangeWithScores(key: string, start: number, stop: number): Promise<{ member: string; score: number }[]>
  async zcount(key: string, min: number | '-inf', max: number | '+inf'): Promise<number>
  async zcard(key: string): Promise<number>
  // 랭킹 헬퍼
  async getTopN(key: string, n: number): Promise<{ member: string; score: number; rank: number }[]>
  async getRankAndScore(key: string, member: string): Promise<{ rank: number | null; score: number | null }>

  // ── Pub/Sub ─────────────────────────────────────────────
  async publish(channel: string, value: unknown): Promise<number>
  subscribe(channel: string, handler: (value: unknown) => void): void
  async unsubscribe(channel: string): Promise<void>

  // ── Key utility ─────────────────────────────────────────
  buildKey(...parts: string[]): string

  // ── 기존 ────────────────────────────────────────────────
  async ping(): Promise<boolean>
  getClient(): Redis
  async disconnect(): Promise<void>
}
```

### 비교키 무효화 패턴 (cGet)

```ts
// 데이터 변경 시 비교키만 갱신
await redis.invalidate('user:123:version')

// 다음 조회 시 자동 stale 감지 → fetchFn 재실행
const profile = await redis.cGetOrSet(
  'user:123:profile',
  'user:123:version',
  () => db.findUser(123),
  3600
)
```

### 랭킹 시스템 예시

```ts
// 점수 추가 / 누적
await redis.zadd('ranking:weekly', [{ score: 1500, member: 'user:42' }])
await redis.zincrby('ranking:weekly', 'user:42', 200)

// 내 순위 + 점수 조회
const { rank, score } = await redis.getRankAndScore('ranking:weekly', 'user:42')

// TOP 10 조회
const top10 = await redis.getTopN('ranking:weekly', 10)
// [{ member: 'user:42', score: 1700, rank: 1 }, ...]
```

## 변경 범위

| 파일 | 변경 내용 |
|------|----------|
| `src/redis/redis.ts` | 메서드 전체 추가, 내부 직렬화 헬퍼(`serialize/deserialize`) 추가 |
| `src/redis/redis.test.ts` | 각 메서드별 단위 테스트 추가 |

## 영향성

| 영향 대상 | 영향 내용 |
|-----------|----------|
| `src/redis/nestjs/` | 변경 없음 — `ForgeRedisClient` 인스턴스만 주입 |
| `src/redis/fastify/` | 변경 없음 — 플러그인은 인스턴스 등록만 |
| `src/redis/index.ts` | 변경 없음 — re-export 그대로 |
| 기존 `ping/getClient/disconnect` | 시그니처 유지, Breaking Changes 없음 |

## Breaking Changes

없음 — 기존 메서드 시그니처 유지, 신규 메서드만 추가

## 위험도

**LOW** — `src/redis/redis.ts` 단일 파일 변경. 다른 모듈 영향 없음.

## 주의사항

- `CachedItem<T>` 직렬화 포맷(`{ cachedAt, data }`)은 `cGet` 계열 메서드 전용. 일반 `get/set`도 동일 포맷 사용해야 `cGet` 타임스탬프 비교 가능
- `cGet` 구현 시 두 키를 `mget`으로 한 번에 읽어야 한다 (docs는 get 2번 — 개선)
- Pub/Sub은 별도 ioredis 인스턴스 필요 (subscribe 중인 클라이언트는 다른 명령 불가)
- Sorted Set `zadd` API는 `{ score, member }[]` 타입 안전 구조 사용 (docs의 `[number, string][]` 대신)
- `getTopN`은 `zrevrange WITHSCORES`로 내림차순 상위 N개 + rank(1-based) 반환
- `buildKey`는 `:`로 파트를 join하는 단순 유틸

## 작업 단계

### 1단계: 내부 직렬화 + String 기본 ops

1. `CachedItem<T>` 인터페이스 및 `serialize/deserialize` private 메서드 정의
2. `get<T>`, `set`, `del`, `exists`, `expire`, `ttl`, `mget<T>` 구현
3. 테스트: 각 메서드 mock 기반 단위 테스트

### 2단계: Cache-aside + 비교키 무효화

1. `getOrSet<T>` — 캐시 없으면 fetchFn 호출 후 저장
2. `cGet<T>` — mget으로 두 키 동시 조회, cachedAt 비교
3. `cGetOrSet<T>` — stale이면 fetchFn 재실행 + 저장
4. `invalidate` — compareKey를 현재 시각으로 갱신
5. 테스트: 캐시 히트/미스/stale 시나리오

### 3단계: Counter ops

1. `incr`, `decr`, `incrby`, `decrby` 구현
2. 테스트

### 4단계: Hash ops

1. `hget<T>`, `hset`, `hmset`, `hgetall<T>`, `hdel`, `hexists`, `hincrby` 구현
2. 테스트

### 5단계: List ops

1. `lpush`, `rpush`, `lpop<T>`, `rpop<T>`, `lrange<T>`, `llen` 구현
2. JSON 직렬화/역직렬화 포함
3. 테스트

### 6단계: Set ops

1. `sadd`, `srem`, `smembers`, `scard`, `sismember` 구현
2. 테스트

### 7단계: Sorted Set + 랭킹 헬퍼

1. `zadd`, `zrem`, `zscore`, `zincrby` 구현
2. `zrank`, `zrevrank`, `zrange`, `zrevrange` 구현
3. `zrangeWithScores`, `zrevrangeWithScores` — `{ member, score }[]` 반환
4. `zcount`, `zcard` 구현
5. `getTopN` — 상위 N개 + 1-based rank 포함
6. `getRankAndScore` — 순위 + 점수 동시 조회 (pipeline 활용)
7. 테스트: 랭킹 시나리오 포함

### 8단계: Pub/Sub

1. `_subscriber` private Redis 인스턴스 추가 (lazy init)
2. `publish`, `subscribe`, `unsubscribe` 구현
3. `disconnect`에서 `_subscriber`도 함께 종료
4. 테스트

### 9단계: Key builder

1. `buildKey(...parts: string[]): string` 구현
2. 테스트

## 검증 방법

- [ ] `npm test` — 전체 테스트 통과 (테스트 수 50개 이상 추가 예상)
- [ ] `npm run build` — 빌드 성공, `.d.ts` 타입 정확히 생성
- [ ] `cGetOrSet` — 캐시 히트 / stale / 미스 세 경우 모두 커버
- [ ] `getTopN` — rank가 1부터 시작하는 1-based 반환 확인
- [ ] `getRankAndScore` — member 없을 때 `{ rank: null, score: null }` 반환 확인

## 참조 규칙

- `docs/redis/index.ts` — 비교키 무효화(cGet 계열), Sorted Set, Pub/Sub 패턴 참조
- `peerDependencies 원칙` — ioredis는 peerDep, 변경 없음
