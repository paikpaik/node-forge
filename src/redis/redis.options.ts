/**
 * @description 캐시 hit/miss 이벤트를 외부에서 관찰하기 위한 인터페이스.
 * `ForgeRedisClient`의 `getOrSet`/`cGetOrSet`이 캐시에서 값을 반환하면 `onHit`,
 * fetchFn을 호출해 새로 가져오면 `onMiss`를 호출한다. 인터페이스는 특정 메트릭
 * 라이브러리에 의존하지 않으므로 `ForgeMetrics` 카운터 외에도 어떤 구현이든 연결할 수 있다.
 * Redis 키 값은 Prometheus 카디널리티 폭발 방지를 위해 노출하지 않는다 — 논리적 캐시
 * 이름은 사용자가 클로저로 직접 전달한다 (예: `hits.labels({ cache: 'user_profile' }).inc()`).
 */
export interface CacheObserver {
  onHit(): void
  onMiss(): void
}

export interface RedisOptions {
  host?: string
  port?: number
  password?: string
  db?: number
  keyPrefix?: string
  tls?: boolean
  connectTimeout?: number
  maxRetriesPerRequest?: number
  /**
   * @description hit/miss 이벤트 수신자. 지정하면 `getOrSet`/`cGetOrSet` 호출 시
   * 결과에 따라 `onHit`/`onMiss`가 동기적으로 호출된다. 생략하면 기존 동작과 동일하다.
   */
  observer?: CacheObserver
  /**
   * @description 활성화하면 동일 키에 대한 동시 cache miss 시 `fetchFn`을 1번만 실행하고
   * 나머지 요청은 그 결과를 공유한다 (thundering herd 방지). 단일 프로세스 범위의 인메모리
   * 중복 제거이므로 멀티 프로세스 환경에서는 별도로 `lock`/`unlock`을 조합해야 한다.
   * 기본값은 `false`이며, 비활성화 시 기존 동작과 완전히 동일하다.
   */
  singleflight?: boolean
}
