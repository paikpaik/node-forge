## 플랜 실행 이력

### 완료: 2026-06-09

**결과**: 성공

**실제 변경 파일**:
- `src/redis/redis.options.ts` — `CacheObserver` 인터페이스 추가(`onHit`, `onMiss`), `RedisOptions`에 `observer?: CacheObserver` 필드 추가, `@description` JSDoc 작성 (카디널리티 주의사항 포함)
- `src/redis/redis.ts` — `CacheObserver` 타입 import 추가, `private readonly observer?` 필드 추가, constructor에서 `this.observer = options.observer` 저장, `getOrSet`/`cGetOrSet` hit/miss 분기에 `this.observer?.onHit()` / `this.observer?.onMiss()` 동기 호출 추가, 두 메서드 `@description` 갱신
- `src/redis/redis.test.ts` — `getOrSet` describe에 observer hit/miss 테스트 2개 추가, `cGetOrSet` describe에 observer hit/miss 테스트 2개 추가 (총 4개 신규)

**계획과의 차이**:
없음 — 계획한 3단계(옵션 추가 → redis.ts 구현 → 테스트/검증)를 그대로 진행했고, `CacheObserver`는 라이브러리 무관 순수 인터페이스로 설계해 `redis` 모듈이 `prom-client`를 참조하지 않는다. 최종적으로 `npm test`(203개, 기존 199 + 신규 4 모두 통과), `npm run build`(`dist/redis.options-*.d.mts`에 `CacheObserver` 정상 포함 확인), `npm run lint` 수행. lint에서 발견된 2개 에러(`events.explorer.ts`의 `no-extra-semi`, `versioning.plugin.ts`의 `no-this-alias`)는 이전 작업 때부터 있던 기존 이슈로 이번 작업 범위 밖.

**잔존 작업**:
없음

---

# cache-hit-miss-metrics — 캐시 hit/miss를 Prometheus 메트릭으로 자동 기록

## 목표

`getOrSet`/`cGetOrSet` 호출 결과가 캐시 hit인지 miss인지 외부에서 관찰할 수 없어, 캐시 효율을 Prometheus에서 모니터링하기 어렵다. `CacheObserver` 인터페이스를 `RedisOptions`에 옵션으로 추가해 hit/miss 이벤트를 라이브러리 무관한 콜백으로 노출하고, 사용자가 `ForgeMetrics` 카운터를 자유롭게 연결할 수 있게 한다.

## 현재 상태 (AS-IS)

```ts
// redis.options.ts — observer 없음
export interface RedisOptions {
  host?: string
  port?: number
  // ...
}

// redis.ts — hit/miss 분기만 있고 외부에 알리는 수단 없음
async getOrSet<T>(key: string, fetchFn: () => Promise<T>, expireSeconds?: number): Promise<T> {
  const cached = await this.get<T>(key)
  if (cached !== null) return cached          // hit — 아무것도 안 함
  const fresh = await fetchFn()
  await this.set(key, fresh, expireSeconds)   // miss — 아무것도 안 함
  return fresh
}
```

캐시 히트율, 미스 빈도를 알 방법이 없어, "캐시가 실제로 효과를 내는가"를 Prometheus/Grafana에서 확인할 수 없다.

## 변경 후 상태 (TO-BE)

```ts
// redis.options.ts — CacheObserver 추가
export interface CacheObserver {
  onHit(): void
  onMiss(): void
}

export interface RedisOptions {
  // ...기존 필드...
  observer?: CacheObserver
}

// redis.ts — hit/miss 시 observer 호출
async getOrSet<T>(key: string, fetchFn: () => Promise<T>, expireSeconds?: number): Promise<T> {
  const cached = await this.get<T>(key)
  if (cached !== null) {
    this.observer?.onHit()
    return cached
  }
  this.observer?.onMiss()
  const fresh = await fetchFn()
  await this.set(key, fresh, expireSeconds)
  return fresh
}
// cGetOrSet도 동일하게 처리
```

사용자는 아래처럼 `ForgeMetrics`와 연결한다:

```ts
const metrics = createMetrics()
const hits  = metrics.counter({ name: 'cache_hits_total',  help: '...', labelNames: ['cache'] })
const misses = metrics.counter({ name: 'cache_misses_total', help: '...', labelNames: ['cache'] })

const redis = new ForgeRedisClient({
  host: 'localhost',
  observer: {
    onHit:  () => hits.labels({ cache: 'user_profile' }).inc(),
    onMiss: () => misses.labels({ cache: 'user_profile' }).inc(),
  },
})
```

## 변경 범위

| 파일 | 변경 내용 |
|------|----------|
| `src/redis/redis.options.ts` | `CacheObserver` 인터페이스 추가, `RedisOptions`에 `observer?: CacheObserver` 필드 추가 |
| `src/redis/redis.ts` | constructor에서 `this.observer` 저장, `getOrSet`/`cGetOrSet` hit/miss 분기에 `observer?` 호출 추가, `@description` 갱신 |
| `src/redis/redis.test.ts` | observer mock으로 hit/miss 호출 검증 테스트 추가 |

## 영향성

| 영향 대상 | 영향 내용 |
|-----------|----------|
| 기존 `ForgeRedisClient` 동작 | 변경 없음 — `observer`는 옵션 필드, 기본값 `undefined` |
| `metrics` 모듈 | 변경 없음 — `redis`가 `metrics`를 import하지 않으므로 모듈 간 결합 없음 |
| `prom-client` 번들 | 영향 없음 — `CacheObserver`는 순수 인터페이스, `prom-client` 타입 참조 없음 |
| `redis.options.ts` exports | `CacheObserver` 타입이 새로 export됨 (하위 호환) |

## Breaking Changes

없음 — `observer`는 옵션 필드라 기존 코드는 수정 없이 그대로 동작한다.

## 위험도

**LOW** — 기존 hit/miss 분기에 선택적 콜백 호출을 추가하는 것이 전부. 분기 로직 자체는 변경되지 않는다.

## 주의사항

- `CacheObserver`는 라이브러리 무관 인터페이스로 설계한다 — `ForgeMetrics`나 `prom-client` 타입을 참조하지 않는다. 사용자가 어떤 메트릭 라이브러리든 연결할 수 있어야 한다.
- `observer?.onHit()` 호출은 `await` 없이 동기 호출이어야 한다 — 비동기 카운터 업데이트로 캐시 응답 레이턴시가 늘어나면 안 된다 (카운터 `inc()`는 prom-client 기준 동기 메서드).
- `key` 레이블은 `CacheObserver`에 노출하지 않는다 — Redis 키에는 ID 등이 포함돼 Prometheus 카디널리티 폭발 위험이 있다. 논리적 캐시 이름은 사용자가 클로저로 직접 전달한다 (위 예시처럼 `hits.labels({ cache: 'user_profile' })`).

## 작업 단계

### 1단계: 인터페이스 및 옵션 추가

1. `src/redis/redis.options.ts`에 `CacheObserver` 인터페이스 추가
2. `RedisOptions`에 `observer?: CacheObserver` 필드 추가
3. `@description` JSDoc 작성 (왜 key를 노출하지 않는지 설명 포함)

### 2단계: redis.ts 구현

1. `ForgeRedisClient` 클래스에 `private readonly observer?: CacheObserver` 필드 추가
2. constructor에서 `this.observer = options.observer` 저장
3. `getOrSet` — hit 분기에 `this.observer?.onHit()`, miss 분기에 `this.observer?.onMiss()` 추가
4. `cGetOrSet` — 동일하게 hit/miss 분기에 observer 호출 추가
5. `getOrSet`/`cGetOrSet`의 `@description` 갱신 (observer 연동 동작 설명)

### 3단계: 테스트 및 검증

1. `redis.test.ts`에 observer 시나리오 테스트 추가:
   - `getOrSet` hit 시 `onHit` 1회 호출, `onMiss` 미호출
   - `getOrSet` miss 시 `onMiss` 1회 호출, `onHit` 미호출
   - `cGetOrSet` hit/miss 동일 검증
   - observer 없이 호출 시 에러 없이 동작 (기존 호환성)
2. `npm test` 전체 회귀 확인
3. `npm run build` — `CacheObserver` `.d.ts` 정상 포함 확인
4. `npm run lint` — 통과 확인

## 검증 방법

- [ ] `npm test` — 신규 observer 테스트 통과 + 기존 테스트 회귀 없음
- [ ] `npm run build` — `dist/redis/redis.options.d.ts`에 `CacheObserver` 인터페이스 포함 확인
- [ ] `npm run lint` — 통과 (기존 2건 pre-existing 에러 제외)
- [ ] `observer` 없이 생성한 `ForgeRedisClient`가 기존과 동일하게 동작하는지 확인
- [ ] `onHit`/`onMiss`가 실제로 hit/miss 분기에서만 각각 정확히 한 번 호출되는지 테스트로 검증

## 참조 규칙

- `[[api-versioning-module]]` — "옵션은 호출 시점에 명시적으로 전달" 원칙: observer도 생성자 옵션으로 명시적으로 전달, 전역 등록 없음
- `.claude/CLAUDE.md` — `core` 순수성 및 프레임워크 격리 규칙: `CacheObserver`는 외부 런타임 의존성 없는 순수 인터페이스로 설계
