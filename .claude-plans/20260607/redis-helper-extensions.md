# redis-helper-extensions — ForgeRedisClient 실무 헬퍼 패턴 추가

## 플랜 실행 이력

### 완료: 2026-06-07

**결과**: 성공

**실제 변경 파일**:
- `src/redis/redis.ts` — 41개 → 49개 메서드 (`lock`, `unlock`, `checkRateLimit`, `mset`, `scanKeys`, `sinter`, `sunion`, `sdiff`, `persist` 추가). 각 메서드에 @description JSDoc 추가
- `src/redis/redis.test.ts` — 90개 → 109개 테스트 (전체 166개 통과)

**계획과의 차이**:
없음 — 5단계 전부 계획대로 완료. `unlock`은 사용자 확인("script가 필요해?")을 거쳐 Lua 스크립트(`UNLOCK_SCRIPT`, GET+DEL 레이스 방지를 위한 비교 후 삭제)로 구현

**잔존 작업**:
없음

---

## 목표

`ForgeRedisClient`(현재 41개 메서드)에 분산 락, Rate Limiter, 일괄 쓰기, 안전한 키 검색,
Set 연산, TTL 해제 등 백엔드에서 자주 필요한 헬퍼 패턴을 추가한다.

## 현재 상태 (AS-IS)

```ts
// src/redis/redis.ts — 41개 메서드 (String/Cache/Counter/Hash/List/Set/SortedSet/PubSub/Key)
// 빠진 부분:
// - 분산 락 없음 → 동시 실행 방지를 직접 SET NX + Lua로 구현해야 함
// - Rate Limiter 헬퍼 없음 → incr+expire 조합을 매번 직접 작성
// - mget만 있고 mset 없음 → 일괄 쓰기 불가
// - KEYS 패턴 검색 없음 (운영 환경에서 KEYS *는 위험, SCAN 필요)
// - Set 간 연산(sinter/sunion/sdiff) 없음
// - persist (TTL 해제) 없음
```

## 변경 후 상태 (TO-BE)

```ts
class ForgeRedisClient {
  // ── 분산 락 ─────────────────────────────────────────────
  async lock(key: string, ttlSeconds: number): Promise<string | null>
  async unlock(key: string, token: string): Promise<boolean>

  // ── Rate Limiter ────────────────────────────────────────
  async checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<{ limited: boolean; remaining: number }>

  // ── 일괄 쓰기 / 안전한 키 검색 ──────────────────────────
  async mset(entries: Record<string, unknown>, expireSeconds?: number): Promise<void>
  async scanKeys(pattern: string, count?: number): Promise<string[]>

  // ── Set 연산 ────────────────────────────────────────────
  async sinter(...keys: string[]): Promise<string[]>
  async sunion(...keys: string[]): Promise<string[]>
  async sdiff(...keys: string[]): Promise<string[]>

  // ── TTL 유틸 ────────────────────────────────────────────
  async persist(key: string): Promise<boolean>
}
```

### 사용 예시

```ts
// 분산 락 — 스케줄러 중복 실행 방지
const token = await redis.lock('job:daily-batch', 30)
if (!token) return  // 이미 실행 중
try {
  await runBatch()
} finally {
  await redis.unlock('job:daily-batch', token)  // 내가 건 락만 해제
}

// Rate Limiter — API 요청 제한
const { limited, remaining } = await redis.checkRateLimit('user:123:api', 100, 60)
if (limited) throw new ForgeHttpError(429, ErrorCode.TOO_MANY_REQUESTS, 'rate limit exceeded')

// 일괄 쓰기 / 안전한 키 검색
await redis.mset({ 'user:1': data1, 'user:2': data2 }, 3600)
const sessionKeys = await redis.scanKeys('session:*')

// Set 연산 — 공통 관심사
const common = await redis.sinter('user:1:follows', 'user:2:follows')

// TTL 해제
await redis.persist('user:123:session')
```

## 변경 범위

| 파일 | 변경 내용 |
|------|----------|
| `src/redis/redis.ts` | 8개 메서드 추가, 각 메서드에 `@description` JSDoc 작성 |
| `src/redis/redis.test.ts` | 메서드별 단위 테스트 추가 |

## 영향성

| 영향 대상 | 영향 내용 |
|-----------|----------|
| `src/redis/nestjs/`, `src/redis/fastify/` | 변경 없음 — 인스턴스 등록/주입 방식 그대로 |
| 기존 41개 메서드 | 변경 없음, 시그니처 유지 |

## Breaking Changes

없음 — 신규 메서드만 추가

## 위험도

**LOW** — `src/redis/redis.ts` 단일 파일에 메서드 추가. 기존 로직 변경 없음.

## 주의사항

- **`lock`**: `SET key token NX PX ttlMs`로 원자적 획득. `token`은 `crypto.randomUUID()`로 생성해 호출자별로 고유해야 한다 (다른 프로세스가 건 락을 실수로 풀지 않도록).
- **`unlock`**: 단순 `del`이 아니라 "내가 설정한 토큰과 일치할 때만 삭제"해야 한다 (GET + DEL은 원자적이지 않으므로 Lua script 또는 `client.eval` 필요).
- **`checkRateLimit`**: `incr` + `expire`를 pipeline으로 묶어 원자적으로 처리한다 (fixed window 방식, 정확한 sliding window가 필요하면 추후 sorted set 기반으로 별도 구현).
- **`scanKeys`**: `KEYS` 대신 `SCAN` 커서 기반으로 구현해 운영 환경 블로킹을 방지한다. `count`는 한 번에 스캔할 힌트 값(기본 100).
- **`mset`**: 기존 `set`과 동일한 `{ cachedAt, data }` 직렬화 포맷을 사용해 `cGet` 패턴과 호환되게 한다. expireSeconds는 모든 엔트리에 동일 적용.

## 작업 단계

### 1단계: 분산 락

1. `lock(key, ttlSeconds)` — `SET NX PX` + `crypto.randomUUID()` 토큰 발급, 실패 시 null 반환
2. `unlock(key, token)` — Lua script로 토큰 일치 시에만 삭제 (`client.eval` 또는 `defineCommand`)
3. 테스트: 락 획득/실패, 토큰 불일치 시 unlock 실패 시나리오

### 2단계: Rate Limiter

1. `checkRateLimit(key, limit, windowSeconds)` — pipeline으로 `incr` + `expire`(첫 호출 시만) 처리
2. `{ limited, remaining }` 반환 형태 구현
3. 테스트: 한도 이내/초과, 첫 요청 시 TTL 설정 확인

### 3단계: 일괄 쓰기 / 안전한 키 검색

1. `mset(entries, expireSeconds?)` — 기존 `serialize` 재사용, pipeline으로 일괄 저장
2. `scanKeys(pattern, count?)` — `SCAN` 커서 루프로 전체 키 수집
3. 테스트: 일괄 저장 검증, 커서가 0이 될 때까지 반복하는지 확인

### 4단계: Set 연산

1. `sinter`, `sunion`, `sdiff` 구현 (가변 인자 키)
2. 테스트: 교집합/합집합/차집합 결과 검증

### 5단계: TTL 유틸

1. `persist(key)` — TTL 제거, 성공 시 true / 키 없거나 TTL 없으면 false
2. 테스트

## 검증 방법

- [ ] `npm test` — 전체 테스트 통과 (20개 이상 추가 예상)
- [ ] `npm run build` — 빌드 성공, `.d.ts` 타입 정확히 생성
- [ ] `lock`/`unlock` — 토큰 불일치 시 다른 프로세스의 락을 풀지 않는지 확인
- [ ] `checkRateLimit` — 한도 초과 시 `limited: true`, 첫 요청에 TTL이 설정되는지 확인
- [ ] `scanKeys` — cursor 0 도달 시 루프 종료 확인

## 참조 규칙

- `[[redis-module-enhancement]]` — 기존 41개 메서드 구현 시 정립한 직렬화/네이밍 컨벤션을 그대로 따른다
- `peerDependencies 원칙` — ioredis는 peerDep, 변경 없음
