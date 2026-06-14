## 플랜 실행 이력

### 완료: 2026-06-11

**결과**: 성공

**실제 변경 파일**:
- `src/redis/redis.ts` — `revalidate` private 헬퍼 추가, `getOrSetSwr` public 메서드 추가
- `src/redis/redis.test.ts` — `getOrSetSwr` 테스트 6개 추가 (기존 247 + 6 = 총 253개)

**계획과의 차이**:
없음 — 설계 그대로 구현됨

**잔존 작업**:
없음 (`cGetOrSetSwr`는 YAGNI로 생략)

---

# swr — Stale-While-Revalidate 캐시 패턴

## 목표

캐시가 만료되지 않았지만 오래됐을 때(stale), 낡은 데이터를 즉시 반환하면서 백그라운드에서 조용히 갱신한다.
사용자는 캐시 미스 레이턴시를 전혀 느끼지 못하고, 데이터는 항상 충분히 fresh하게 유지된다.
`getOrSetSwr(key, fetchFn, { expireSeconds, staleAfter })` 신규 메서드로 구현하며, 기존 `getOrSet`은 건드리지 않는다.

## 현재 상태 (AS-IS)

```ts
// getOrSet — fresh/stale 구분 없이 null이면 항상 blocking fetch
async getOrSet<T>(key, fetchFn, expireSeconds?): Promise<T> {
  const cached = await this.get<T>(key)
  if (cached !== null) {
    return cached  // TTL 남아 있으면 무조건 그대로 반환
  }
  // miss → blocking fetch → 사용자가 기다림
  const fresh = await fetchFn()
  await this.set(key, fresh, expireSeconds)
  return fresh
}
```

`{ cachedAt, data }` 포맷으로 저장되어 있어 `cachedAt`으로 데이터 나이를 계산할 수 있지만,
현재 `getOrSet`은 이 정보를 사용하지 않는다.

## 변경 후 상태 (TO-BE)

### getOrSetSwr 상태 흐름

```
       cachedAt 기준 나이
          │
   staleAfter < 나이?
    ├── NO  → Fresh → 즉시 반환 (onHit)
    └── YES → Stale → 즉시 반환(stale) + 백그라운드 갱신 시작 (onMiss)

   키가 없거나 Redis TTL 만료?
    └── Expired → blocking fetch → 저장 → 반환 (onMiss)
```

### 구현

```ts
// src/redis/redis.ts

async getOrSetSwr<T>(
  key: string,
  fetchFn: () => Promise<T>,
  options: { expireSeconds: number; staleAfter: number },
): Promise<T> {
  const raw = await this.client.get(key)
  const item = this.deserialize<T>(raw)

  if (item.data !== null) {
    const ageSeconds = (Date.now() - item.cachedAt) / 1000
    if (ageSeconds < options.staleAfter) {
      this.observer?.onHit()
      return item.data
    }
    // Stale: 즉시 반환 + 백그라운드 갱신 (fire-and-forget)
    this.observer?.onMiss()
    void this.revalidate(key, fetchFn, options.expireSeconds)
    return item.data
  }

  // Expired/missing: blocking fetch
  this.observer?.onMiss()
  return this.revalidate(key, fetchFn, options.expireSeconds)
}

private revalidate<T>(key: string, fetchFn: () => Promise<T>, expireSeconds: number): Promise<T> {
  const existing = this._inflight.get(key)
  if (existing) return existing as Promise<T>

  const promise = fetchFn()
    .then(async (fresh) => {
      await this.set(key, fresh, expireSeconds)
      return fresh
    })
    .finally(() => {
      this._inflight.delete(key)
    })
  this._inflight.set(key, promise)
  return promise
}
```

### 사용 예시

```ts
// expireSeconds=300: Redis TTL 5분
// staleAfter=60: 60초 지나면 stale 처리
const data = await redis.getOrSetSwr('user:1', () => db.findUser(1), {
  expireSeconds: 300,
  staleAfter: 60,
})
// → 60초 이내: 즉시 반환 (fresh)
// → 60~300초: stale 반환 + 백그라운드 갱신
// → 300초 초과(키 만료): blocking fetch
```

### revalidate와 singleflight의 관계

`revalidate`는 `_inflight` Map을 **항상** 사용한다 (`_singleflight` 플래그 무관).
SWR 백그라운드 갱신은 중복 실행 방지가 항상 필요하기 때문이다.
singleflight가 활성화된 상태에서 blocking miss가 진행 중이면 같은 키의 SWR 갱신도 자동으로 합류해 별도 실행이 억제된다.

## 변경 범위

| 파일 | 변경 내용 |
|------|----------|
| `src/redis/redis.ts` | `getOrSetSwr` public 메서드 추가, `revalidate` private 헬퍼 추가 |
| `src/redis/redis.test.ts` | `getOrSetSwr` 동작 테스트 추가 |

`RedisOptions` 변경 없음 — SWR 옵션은 메서드 호출 시 inline으로 전달.

## 영향성

| 영향 대상 | 영향 내용 |
|-----------|----------|
| 기존 `getOrSet` | 변경 없음 |
| 기존 `cGetOrSet` | 변경 없음 |
| `_inflight` Map | `revalidate`가 공유해서 사용 — singleflight와 SWR 갱신이 같은 키에서 경쟁하지 않음 |
| `observer` | `onHit` / `onMiss` 호출 기존과 동일 (fresh → hit, stale/expired → miss) |

## Breaking Changes

없음 — `getOrSetSwr`는 신규 메서드 추가이고 기존 API는 변경 없다.

## 위험도

**LOW** — 기존 메서드를 건드리지 않고 신규 메서드만 추가. 백그라운드 갱신 에러는 `void`로 소비되어 사용자 요청에 영향 없음.

## 주의사항

- **백그라운드 갱신 에러 무시**: stale 반환 후 `void this.revalidate(...)` — 갱신이 실패해도 사용자 요청은 정상 완료된다. 에러 로깅이 필요하면 `options.logger`를 추가하거나 `observer`를 확장하면 되지만, 이번 플랜에서는 YAGNI 원칙으로 생략한다.
- **`staleAfter < expireSeconds` 제약**: `staleAfter >= expireSeconds`이면 SWR 효과가 없다 (키가 이미 만료된 상태에서 stale 체크를 하게 됨). 런타임 검증은 하지 않고 JSDoc에 명시한다.
- **`cachedAt` 정밀도**: `Date.now()`는 밀리초 단위라 초 단위로 나누면 충분히 정확하다. 서버 간 시계 차이가 크면 stale 판정이 약간 틀릴 수 있지만 SWR 특성상 허용 범위다.
- **`cGetOrSetSwr`**: 비교키 무효화 패턴의 SWR 버전은 이번 범위 밖이다.

## 작업 단계

### 1단계: redis.ts — revalidate + getOrSetSwr 추가

1. `revalidate<T>(key, fetchFn, expireSeconds)` private 메서드 추가 — `_inflight` 공유, `fetchFn().then(set).finally(delete)`
2. `getOrSetSwr<T>(key, fetchFn, options)` public 메서드 추가 — fresh/stale/expired 분기 처리

### 2단계: redis.test.ts 테스트 추가

1. **Fresh 반환**: `cachedAt`이 `staleAfter` 이내이면 즉시 반환하고 fetchFn을 호출하지 않는다
2. **Stale 반환 + 백그라운드 갱신**: `cachedAt`이 `staleAfter` 초과이면 stale 값을 즉시 반환하고 fetchFn이 백그라운드에서 실행된다
3. **Expired blocking fetch**: 키가 없으면 blocking fetch 후 반환한다
4. **백그라운드 갱신 중복 방지**: stale 상태에서 동시 호출이 와도 fetchFn은 1번만 실행된다

## 검증 방법

- [ ] `npm test` — 신규 테스트 통과 + 기존 테스트(현재 247개) 회귀 없음
- [ ] `npm run build` — `dist/redis/index.d.ts`에 `getOrSetSwr` 포함 확인
- [ ] `npm run lint` — 통과 (pre-existing 2건 제외)
- [ ] fresh 케이스에서 `observer.onHit()` 호출, stale/expired에서 `observer.onMiss()` 호출 확인

## 참조 규칙

- `[[singleflight]]` — `_inflight` Map 공유, `revalidate`가 singleflight와 같은 dedup 로직 사용
- `[[cache-hit-miss-metrics]]` — `observer` 패턴 동일하게 적용
