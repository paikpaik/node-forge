import { randomUUID } from 'node:crypto'
import Redis from 'ioredis'
import type { RedisOptions } from './redis.options'

const UNLOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`

interface CachedItem<T> {
  cachedAt: number
  data: T
}

export class ForgeRedisClient {
  private readonly client: Redis
  private _subscriber: Redis | null = null
  private readonly _channels = new Map<string, (value: unknown) => void>()

  constructor(options: RedisOptions = {}) {
    this.client = new Redis({
      host: options.host ?? 'localhost',
      port: options.port ?? 6379,
      password: options.password,
      db: options.db ?? 0,
      keyPrefix: options.keyPrefix,
      connectTimeout: options.connectTimeout ?? 10_000,
      maxRetriesPerRequest: options.maxRetriesPerRequest ?? 3,
      retryStrategy: (times) => Math.min(times * 50, 2_000),
      lazyConnect: true,
      ...(options.tls && { tls: {} }),
    })
  }

  // ── Serialization ─────────────────────────────────────────────────────────

  private serialize<T>(value: T): string {
    return JSON.stringify({ cachedAt: Date.now(), data: value })
  }

  private deserialize<T>(raw: string | null): CachedItem<T | null> {
    if (raw === null || raw === undefined) return { cachedAt: 0, data: null }
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      if ('cachedAt' in parsed && 'data' in parsed) {
        return parsed as unknown as CachedItem<T>
      }
    } catch {
      // not a CachedItem — treat raw string as data
    }
    return { cachedAt: 0, data: raw as unknown as T }
  }

  // ── String ────────────────────────────────────────────────────────────────

  /**
   * @description 키에 저장된 값을 가져온다. 내부적으로 { cachedAt, data } 포맷으로 직렬화되어 있으므로
   * 자동으로 역직렬화해 data 부분만 반환한다. 키가 없으면 null을 반환한다.
   */
  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key)
    return this.deserialize<T>(raw).data
  }

  /**
   * @description 값을 { cachedAt, data } 포맷으로 직렬화해서 저장한다.
   * expireSeconds를 전달하면 TTL을 설정하고, 0이면 키를 삭제한다.
   * cGet/cGetOrSet 비교키 무효화 패턴과 함께 사용하려면 반드시 이 메서드로 저장해야 한다.
   */
  async set(key: string, value: unknown, expireSeconds?: number): Promise<void> {
    const serialized = this.serialize(value)
    if (expireSeconds !== undefined) {
      if (expireSeconds > 0) {
        await this.client.setex(key, expireSeconds, serialized)
      } else {
        await this.client.del(key)
      }
    } else {
      await this.client.set(key, serialized)
    }
  }

  /**
   * @description 하나 이상의 키를 삭제한다. 삭제된 키의 수를 반환한다.
   * 존재하지 않는 키는 무시한다.
   */
  async del(...keys: string[]): Promise<number> {
    return this.client.del(...keys)
  }

  /**
   * @description 하나 이상의 키가 존재하는지 확인한다. 존재하는 키의 수를 반환한다.
   * 같은 키를 여러 번 전달하면 중복 카운트된다.
   */
  async exists(...keys: string[]): Promise<number> {
    return this.client.exists(...keys)
  }

  /**
   * @description 키의 만료 시간을 초 단위로 설정한다.
   * 키가 존재하고 TTL이 설정되면 true, 키가 없으면 false를 반환한다.
   */
  async expire(key: string, seconds: number): Promise<boolean> {
    const result = await this.client.expire(key, seconds)
    return result === 1
  }

  /**
   * @description 키의 남은 TTL을 초 단위로 반환한다.
   * TTL이 없는 키는 -1, 존재하지 않는 키는 -2를 반환한다.
   */
  async ttl(key: string): Promise<number> {
    return this.client.ttl(key)
  }

  /**
   * @description 키에 설정된 TTL을 제거해 영구 키로 전환한다.
   * TTL이 제거되면 true, 키가 없거나 원래 TTL이 없었다면 false를 반환한다.
   * "이벤트 기간에만 만료되던 데이터를 영구 보존으로 전환" 같은 상황에 사용한다.
   */
  async persist(key: string): Promise<boolean> {
    const result = await this.client.persist(key)
    return result === 1
  }

  /**
   * @description 여러 키의 값을 한 번의 네트워크 요청으로 가져온다.
   * 각 값은 자동으로 역직렬화되며, 존재하지 않는 키는 null로 반환된다.
   * 빈 배열을 전달하면 Redis 호출 없이 빈 배열을 반환한다.
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    if (keys.length === 0) return []
    const raws = await this.client.mget(...keys)
    return raws.map((raw) => this.deserialize<T>(raw).data)
  }

  // ── Cache-aside & 비교키 무효화 ──────────────────────────────────────────

  /**
   * @description 캐시가 있으면 바로 반환하고, 없으면 fetchFn을 호출해 데이터를 가져온 뒤 저장한다.
   * DB 직접 조회 빈도를 줄이는 표준 cache-aside 패턴이다.
   * expireSeconds를 지정하면 캐시에 TTL이 적용된다.
   */
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    expireSeconds?: number,
  ): Promise<T> {
    const cached = await this.get<T>(key)
    if (cached !== null) return cached
    const fresh = await fetchFn()
    await this.set(key, fresh, expireSeconds)
    return fresh
  }

  /**
   * @description 데이터 키와 비교키를 mget으로 한 번에 읽어 타임스탬프를 비교한다.
   * 데이터의 cachedAt이 비교키의 cachedAt보다 오래됐거나 데이터가 없으면 null을 반환한다(stale 처리).
   * 비교키를 invalidate()로 갱신하는 것만으로 연결된 모든 캐시를 무효화할 수 있다.
   */
  async cGet<T>(key: string, compareKey: string): Promise<T | null> {
    const raws = await this.client.mget(key, compareKey)
    const item = this.deserialize<T>(raws[0])
    const compare = this.deserialize<unknown>(raws[1])
    if (item.data === null || item.cachedAt < compare.cachedAt) return null
    return item.data
  }

  /**
   * @description cGet으로 최신 여부를 확인하고, stale이거나 없으면 fetchFn을 호출해 재저장한다.
   * del 없이 비교키 하나만 invalidate()하면 이 메서드를 통해 자동으로 갱신된다.
   * 엔티티 하나에 연결된 캐시 키가 여러 개일 때 특히 유용하다.
   */
  async cGetOrSet<T>(
    key: string,
    compareKey: string,
    fetchFn: () => Promise<T>,
    expireSeconds?: number,
  ): Promise<T> {
    const cached = await this.cGet<T>(key, compareKey)
    if (cached !== null) return cached
    const fresh = await fetchFn()
    await this.set(key, fresh, expireSeconds)
    return fresh
  }

  /**
   * @description 비교키의 타임스탬프를 현재 시각으로 갱신해 연결된 캐시를 일괄 무효화한다.
   * 이 키를 compareKey로 사용하는 모든 cGet/cGetOrSet 호출이 다음 조회 시 stale로 처리된다.
   * 실제 데이터 키를 건드리지 않아도 되므로 대량 무효화 비용이 O(1)이다.
   */
  async invalidate(compareKey: string): Promise<void> {
    await this.set(compareKey, null)
  }

  // ── 분산 락 ───────────────────────────────────────────────────────────────

  /**
   * @description SET NX PX로 락을 원자적으로 획득한다. 이미 다른 프로세스가 락을 보유 중이면 null을 반환한다.
   * 성공 시 고유 토큰을 반환하며, 이 토큰은 unlock 시 본인이 건 락인지 검증하는 데 사용된다.
   * 스케줄러 중복 실행 방지, 동시 결제 방지 등 분산 환경의 상호 배제에 사용한다.
   */
  async lock(key: string, ttlSeconds: number): Promise<string | null> {
    const token = randomUUID()
    const result = await this.client.set(key, token, 'PX', ttlSeconds * 1000, 'NX')
    return result === 'OK' ? token : null
  }

  /**
   * @description lock()으로 발급받은 토큰이 현재 값과 일치할 때만 락을 해제한다.
   * GET 후 DEL을 따로 호출하면 그 사이에 TTL 만료 + 다른 프로세스의 락 획득이 끼어들 수 있어
   * Lua 스크립트로 "비교 후 삭제"를 원자적으로 수행한다.
   * 토큰이 일치해 해제에 성공하면 true, 이미 만료되었거나 다른 프로세스의 락이면 false를 반환한다.
   */
  async unlock(key: string, token: string): Promise<boolean> {
    const result = await this.client.eval(UNLOCK_SCRIPT, 1, key, token)
    return result === 1
  }

  // ── Rate Limiter ────────────────────────────────────────────────────────────

  /**
   * @description 고정 윈도우(fixed window) 방식의 요청 제한을 검사한다.
   * `incr`로 요청 횟수를 누적하고, 윈도우의 첫 요청일 때만 `expire`로 TTL을 설정한다 — 두 명령을
   * pipeline으로 묶어 왕복을 줄이고 카운트 증가와 만료 설정 사이의 레이스를 없앤다.
   * 누적 횟수가 limit을 초과하면 `limited: true`를, 함께 남은 허용 횟수(`remaining`, 0 이상)를 반환한다.
   * API 요청 제한, 로그인 시도 제한 등에 사용한다.
   */
  async checkRateLimit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ limited: boolean; remaining: number }> {
    const pipeline = this.client.pipeline()
    pipeline.incr(key)
    pipeline.expire(key, windowSeconds, 'NX')
    const results = await pipeline.exec()
    const count = results?.[0]?.[1] as number
    return {
      limited: count > limit,
      remaining: Math.max(0, limit - count),
    }
  }

  // ── 일괄 쓰기 / 안전한 키 검색 ──────────────────────────────────────────────

  /**
   * @description 여러 키-값 쌍을 pipeline으로 한 번에 저장한다. set과 동일하게 각 값을
   * { cachedAt, data } 포맷으로 직렬화하므로 cGet 계열 비교키 무효화 패턴과 호환된다.
   * expireSeconds를 전달하면 모든 엔트리에 동일한 TTL을 적용한다.
   */
  async mset(entries: Record<string, unknown>, expireSeconds?: number): Promise<void> {
    const keys = Object.keys(entries)
    if (keys.length === 0) return
    const pipeline = this.client.pipeline()
    for (const key of keys) {
      const serialized = this.serialize(entries[key])
      if (expireSeconds !== undefined && expireSeconds > 0) {
        pipeline.setex(key, expireSeconds, serialized)
      } else {
        pipeline.set(key, serialized)
      }
    }
    await pipeline.exec()
  }

  /**
   * @description SCAN 커서를 사용해 패턴에 매칭되는 키를 안전하게 모두 수집한다.
   * KEYS는 단일 명령으로 전체 키 공간을 훑어 운영 환경에서 블로킹을 일으키므로,
   * 대신 커서 기반으로 분할 조회하며 cursor가 '0'으로 돌아올 때까지 반복한다.
   * count는 한 번의 SCAN 호출에서 살펴볼 키 개수에 대한 힌트(기본 100)이며 정확한 반환 개수를 보장하지 않는다.
   */
  async scanKeys(pattern: string, count = 100): Promise<string[]> {
    const keys: string[] = []
    let cursor = '0'
    do {
      const [nextCursor, found] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', count)
      keys.push(...found)
      cursor = nextCursor
    } while (cursor !== '0')
    return keys
  }

  // ── Counter ───────────────────────────────────────────────────────────────

  /**
   * @description 키의 정수 값을 1 증가시키고 결과를 반환한다.
   * 키가 없으면 0으로 초기화한 뒤 증가한다. 조회수, 시도 횟수 등 카운터에 사용한다.
   */
  async incr(key: string): Promise<number> {
    return this.client.incr(key)
  }

  /**
   * @description 키의 정수 값을 1 감소시키고 결과를 반환한다.
   * 키가 없으면 0으로 초기화한 뒤 감소한다.
   */
  async decr(key: string): Promise<number> {
    return this.client.decr(key)
  }

  /**
   * @description 키의 정수 값을 increment만큼 증가시키고 결과를 반환한다.
   * 포인트 적립, 잔액 증가 등 임의 단위 증감에 사용한다.
   */
  async incrby(key: string, increment: number): Promise<number> {
    return this.client.incrby(key, increment)
  }

  /**
   * @description 키의 정수 값을 decrement만큼 감소시키고 결과를 반환한다.
   */
  async decrby(key: string, decrement: number): Promise<number> {
    return this.client.decrby(key, decrement)
  }

  // ── Hash ──────────────────────────────────────────────────────────────────

  /**
   * @description 해시의 특정 필드 값을 가져온다. JSON으로 역직렬화해서 반환하며,
   * 파싱에 실패하면 raw 문자열을 그대로 반환한다. 필드가 없으면 null을 반환한다.
   */
  async hget<T>(key: string, field: string): Promise<T | null> {
    const raw = await this.client.hget(key, field)
    if (raw === null) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      return raw as unknown as T
    }
  }

  /**
   * @description 해시의 특정 필드에 값을 JSON 직렬화해서 저장한다.
   * 해시 전체를 덮어쓰지 않고 해당 필드만 갱신한다.
   */
  async hset(key: string, field: string, value: unknown): Promise<void> {
    await this.client.hset(key, field, JSON.stringify(value))
  }

  /**
   * @description 여러 필드를 한 번에 해시에 저장한다. 각 값은 JSON 직렬화된다.
   * hset을 여러 번 호출하는 것보다 네트워크 왕복을 줄일 수 있다.
   */
  async hmset(key: string, data: Record<string, unknown>): Promise<void> {
    const serialized = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, JSON.stringify(v)]),
    )
    await this.client.hmset(key, serialized)
  }

  /**
   * @description 해시의 모든 필드와 값을 가져온다. 각 값은 JSON 역직렬화된다.
   * 해시가 없거나 비어 있으면 null을 반환한다.
   */
  async hgetall<T>(key: string): Promise<Record<string, T> | null> {
    const raw = await this.client.hgetall(key)
    if (!raw || Object.keys(raw).length === 0) return null
    return Object.fromEntries(
      Object.entries(raw).map(([k, v]) => {
        try {
          return [k, JSON.parse(v) as T]
        } catch {
          return [k, v as unknown as T]
        }
      }),
    )
  }

  /**
   * @description 해시에서 하나 이상의 필드를 삭제한다. 삭제된 필드 수를 반환한다.
   * 존재하지 않는 필드는 무시한다.
   */
  async hdel(key: string, ...fields: string[]): Promise<number> {
    return this.client.hdel(key, ...fields)
  }

  /**
   * @description 해시에 특정 필드가 존재하는지 확인한다. 존재하면 true, 없으면 false를 반환한다.
   */
  async hexists(key: string, field: string): Promise<boolean> {
    const result = await this.client.hexists(key, field)
    return result === 1
  }

  /**
   * @description 해시 필드의 정수 값을 increment만큼 증가시키고 결과를 반환한다.
   * 필드가 없으면 0으로 초기화한 뒤 증가한다. 사용자별 통계 누적에 유용하다.
   */
  async hincrby(key: string, field: string, increment: number): Promise<number> {
    return this.client.hincrby(key, field, increment)
  }

  // ── List ──────────────────────────────────────────────────────────────────

  /**
   * @description 하나 이상의 값을 리스트의 앞(head)에 추가한다. 값은 JSON 직렬화된다.
   * 여러 값을 전달하면 순서대로 앞에 쌓인다. 추가 후 리스트 길이를 반환한다.
   */
  async lpush(key: string, ...values: unknown[]): Promise<number> {
    return this.client.lpush(key, ...values.map((v) => JSON.stringify(v)))
  }

  /**
   * @description 하나 이상의 값을 리스트의 뒤(tail)에 추가한다. 값은 JSON 직렬화된다.
   * 큐(Queue) 패턴에서 enqueue로 사용한다. 추가 후 리스트 길이를 반환한다.
   */
  async rpush(key: string, ...values: unknown[]): Promise<number> {
    return this.client.rpush(key, ...values.map((v) => JSON.stringify(v)))
  }

  /**
   * @description 리스트의 앞(head)에서 값을 꺼낸다. 값은 JSON 역직렬화된다.
   * count를 전달하면 해당 수만큼 꺼내 배열로 반환한다.
   * 리스트가 비어 있으면 null(단일) 또는 빈 배열(count 지정)을 반환한다.
   */
  async lpop<T>(key: string): Promise<T | null>
  async lpop<T>(key: string, count: number): Promise<T[]>
  async lpop<T>(key: string, count?: number): Promise<T | T[] | null> {
    if (count !== undefined) {
      const raws = await this.client.lpop(key, count)
      return (raws ?? []).map((v) => JSON.parse(v) as T)
    }
    const raw = await this.client.lpop(key)
    return raw !== null ? (JSON.parse(raw) as T) : null
  }

  /**
   * @description 리스트의 뒤(tail)에서 값을 꺼낸다. 값은 JSON 역직렬화된다.
   * count를 전달하면 해당 수만큼 꺼내 배열로 반환한다.
   * 리스트가 비어 있으면 null(단일) 또는 빈 배열(count 지정)을 반환한다.
   */
  async rpop<T>(key: string): Promise<T | null>
  async rpop<T>(key: string, count: number): Promise<T[]>
  async rpop<T>(key: string, count?: number): Promise<T | T[] | null> {
    if (count !== undefined) {
      const raws = await this.client.rpop(key, count)
      return (raws ?? []).map((v) => JSON.parse(v) as T)
    }
    const raw = await this.client.rpop(key)
    return raw !== null ? (JSON.parse(raw) as T) : null
  }

  /**
   * @description 리스트의 start~stop 인덱스 범위 요소를 가져온다. 값은 JSON 역직렬화된다.
   * stop에 -1을 전달하면 마지막 요소까지 가져온다.
   */
  async lrange<T>(key: string, start: number, stop: number): Promise<T[]> {
    const raws = await this.client.lrange(key, start, stop)
    return raws.map((v) => JSON.parse(v) as T)
  }

  /**
   * @description 리스트의 현재 길이를 반환한다. 키가 없으면 0을 반환한다.
   */
  async llen(key: string): Promise<number> {
    return this.client.llen(key)
  }

  // ── Set ───────────────────────────────────────────────────────────────────

  /**
   * @description 셋에 하나 이상의 멤버를 추가한다. 이미 존재하는 멤버는 무시된다.
   * 실제로 추가된 새 멤버 수를 반환한다.
   */
  async sadd(key: string, ...members: string[]): Promise<number> {
    return this.client.sadd(key, ...members)
  }

  /**
   * @description 셋에서 하나 이상의 멤버를 제거한다. 존재하지 않는 멤버는 무시된다.
   * 실제로 제거된 멤버 수를 반환한다.
   */
  async srem(key: string, ...members: string[]): Promise<number> {
    return this.client.srem(key, ...members)
  }

  /**
   * @description 셋의 모든 멤버를 배열로 반환한다. 순서는 보장되지 않는다.
   * 태그 목록, 권한 집합 등 중복 없는 문자열 컬렉션 조회에 사용한다.
   */
  async smembers(key: string): Promise<string[]> {
    return this.client.smembers(key)
  }

  /**
   * @description 셋에 속한 멤버의 수를 반환한다. 키가 없으면 0을 반환한다.
   */
  async scard(key: string): Promise<number> {
    return this.client.scard(key)
  }

  /**
   * @description 특정 멤버가 셋에 속하는지 확인한다. 존재하면 true, 없으면 false를 반환한다.
   * 팔로우 여부, 좋아요 여부 등 O(1) 멤버십 체크에 활용한다.
   */
  async sismember(key: string, member: string): Promise<boolean> {
    const result = await this.client.sismember(key, member)
    return result === 1
  }

  /**
   * @description 둘 이상의 셋에 공통으로 속한 멤버(교집합)를 반환한다.
   * 두 사용자의 공통 관심사·맞팔로우 등 "둘 다에 속한 것"을 구할 때 사용한다.
   */
  async sinter(...keys: string[]): Promise<string[]> {
    return this.client.sinter(...keys)
  }

  /**
   * @description 둘 이상의 셋에 속한 멤버를 중복 없이 모두 합친(합집합) 결과를 반환한다.
   * 여러 그룹의 전체 구성원 목록을 구할 때 사용한다.
   */
  async sunion(...keys: string[]): Promise<string[]> {
    return this.client.sunion(...keys)
  }

  /**
   * @description 첫 번째 셋에는 있지만 이후 셋들에는 없는 멤버(차집합)를 반환한다.
   * "추천 후보 중 이미 본 항목 제외" 같은 제외 연산에 사용한다.
   */
  async sdiff(...keys: string[]): Promise<string[]> {
    return this.client.sdiff(...keys)
  }

  // ── Sorted Set ────────────────────────────────────────────────────────────

  /**
   * @description Sorted Set에 { score, member } 쌍을 추가하거나 갱신한다.
   * 동일 member가 이미 있으면 score만 업데이트된다. 새로 추가된 멤버 수를 반환한다.
   * 랭킹 시스템에서 점수 등록 시 사용한다.
   */
  async zadd(key: string, entries: { score: number; member: string }[]): Promise<number> {
    if (entries.length === 0) return 0
    const args = entries.flatMap(({ score, member }) => [score, member]) as (string | number)[]
    return this.client.zadd(key, ...args) as Promise<number>
  }

  /**
   * @description Sorted Set에서 하나 이상의 멤버를 제거한다. 실제 제거된 수를 반환한다.
   * 탈퇴한 사용자를 랭킹에서 제외할 때 사용한다.
   */
  async zrem(key: string, ...members: string[]): Promise<number> {
    return this.client.zrem(key, ...members)
  }

  /**
   * @description 특정 멤버의 score를 number로 반환한다. 멤버가 없으면 null을 반환한다.
   * 내 점수를 개별 조회할 때 사용한다.
   */
  async zscore(key: string, member: string): Promise<number | null> {
    const raw = await this.client.zscore(key, member)
    return raw !== null ? parseFloat(raw) : null
  }

  /**
   * @description 특정 멤버의 score를 increment만큼 증가시키고 새 score를 반환한다.
   * 점수를 덮어쓰지 않고 누적할 때 사용한다. 음수 increment로 감소도 가능하다.
   */
  async zincrby(key: string, member: string, increment: number): Promise<number> {
    const raw = await this.client.zincrby(key, increment, member)
    return parseFloat(raw)
  }

  /**
   * @description score 오름차순 기준 멤버의 순위를 0-based로 반환한다.
   * 멤버가 없으면 null을 반환한다. 낮은 score가 낮은 index다.
   */
  async zrank(key: string, member: string): Promise<number | null> {
    return this.client.zrank(key, member)
  }

  /**
   * @description score 내림차순 기준 멤버의 순위를 0-based로 반환한다.
   * 멤버가 없으면 null을 반환한다. 높은 score가 낮은 index(1위)가 된다.
   * getRankAndScore와 달리 순위만 필요할 때 사용한다.
   */
  async zrevrank(key: string, member: string): Promise<number | null> {
    return this.client.zrevrank(key, member)
  }

  /**
   * @description score 오름차순으로 start~stop 범위의 멤버를 반환한다.
   * stop에 -1을 전달하면 마지막까지 조회한다.
   */
  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.client.zrange(key, start, stop)
  }

  /**
   * @description score 내림차순으로 start~stop 범위의 멤버를 반환한다.
   * 상위권 멤버 목록을 가져올 때 사용한다. score도 함께 필요하면 zrevrangeWithScores를 사용한다.
   */
  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.client.zrevrange(key, start, stop)
  }

  /**
   * @description score 오름차순으로 start~stop 범위의 멤버와 score를 { member, score }[] 형태로 반환한다.
   */
  async zrangeWithScores(
    key: string,
    start: number,
    stop: number,
  ): Promise<{ member: string; score: number }[]> {
    const raws = await this.client.zrange(key, start, stop, 'WITHSCORES')
    return this.parseWithScores(raws)
  }

  /**
   * @description score 내림차순으로 start~stop 범위의 멤버와 score를 { member, score }[] 형태로 반환한다.
   * rank 정보까지 필요하면 getTopN을 사용한다.
   */
  async zrevrangeWithScores(
    key: string,
    start: number,
    stop: number,
  ): Promise<{ member: string; score: number }[]> {
    const raws = await this.client.zrevrange(key, start, stop, 'WITHSCORES')
    return this.parseWithScores(raws)
  }

  /**
   * @description min~max score 범위에 속하는 멤버 수를 반환한다.
   * '-inf', '+inf'로 전체 범위를 지정할 수 있다.
   */
  async zcount(key: string, min: number | '-inf', max: number | '+inf'): Promise<number> {
    return this.client.zcount(key, min, max)
  }

  /**
   * @description Sorted Set의 전체 멤버 수를 반환한다. 키가 없으면 0을 반환한다.
   */
  async zcard(key: string): Promise<number> {
    return this.client.zcard(key)
  }

  // ── 랭킹 헬퍼 ────────────────────────────────────────────────────────────

  /**
   * @description score 내림차순으로 상위 N명을 가져와 1-based rank를 부여해 반환한다.
   * MySQL ORDER BY score DESC LIMIT N 대비 O(log N + N)으로 성능이 뛰어나다.
   * 반환 형태: { member, score, rank }[] — rank는 1부터 시작한다.
   */
  async getTopN(
    key: string,
    n: number,
  ): Promise<{ member: string; score: number; rank: number }[]> {
    const raws = await this.client.zrevrange(key, 0, n - 1, 'WITHSCORES')
    return this.parseWithScores(raws).map((entry, i) => ({ ...entry, rank: i + 1 }))
  }

  /**
   * @description 특정 멤버의 순위(1-based)와 score를 pipeline으로 한 번에 조회한다.
   * 두 번의 네트워크 왕복 없이 원자적으로 가져온다.
   * 멤버가 없으면 { rank: null, score: null }을 반환한다.
   */
  async getRankAndScore(
    key: string,
    member: string,
  ): Promise<{ rank: number | null; score: number | null }> {
    const pipeline = this.client.pipeline()
    pipeline.zrevrank(key, member)
    pipeline.zscore(key, member)
    const results = await pipeline.exec()
    const rank = results?.[0]?.[1] as number | null
    const scoreRaw = results?.[1]?.[1] as string | null
    return {
      rank: rank !== null ? rank + 1 : null,
      score: scoreRaw !== null ? parseFloat(scoreRaw) : null,
    }
  }

  private parseWithScores(raws: string[]): { member: string; score: number }[] {
    const result: { member: string; score: number }[] = []
    for (let i = 0; i < raws.length; i += 2) {
      result.push({ member: raws[i], score: parseFloat(raws[i + 1]) })
    }
    return result
  }

  // ── Pub/Sub ───────────────────────────────────────────────────────────────

  /**
   * @description 채널에 값을 JSON 직렬화해서 발행한다. 해당 채널을 구독 중인 클라이언트 수를 반환한다.
   * 이벤트 브로드캐스트, 실시간 알림 전송에 사용한다.
   */
  async publish(channel: string, value: unknown): Promise<number> {
    return this.client.publish(channel, JSON.stringify(value))
  }

  /**
   * @description 채널을 구독하고 메시지 수신 시 handler를 호출한다.
   * 내부적으로 subscribe 전용 Redis 인스턴스를 lazy하게 생성한다(subscribe 중인 클라이언트는 다른 명령 불가).
   * 수신된 메시지는 JSON 역직렬화 후 handler에 전달된다.
   */
  subscribe(channel: string, handler: (value: unknown) => void): void {
    this._channels.set(channel, handler)
    void this.getSubscriber().subscribe(channel)
  }

  /**
   * @description 채널 구독을 해제하고 handler를 제거한다.
   * 구독 중인 채널이 없어도 안전하게 호출할 수 있다.
   */
  async unsubscribe(channel: string): Promise<void> {
    this._channels.delete(channel)
    if (this._subscriber) {
      await this._subscriber.unsubscribe(channel)
    }
  }

  private getSubscriber(): Redis {
    if (!this._subscriber) {
      this._subscriber = this.client.duplicate()
      this._subscriber.on('message', (channel: string, message: string) => {
        const handler = this._channels.get(channel)
        if (!handler) return
        try {
          handler(JSON.parse(message) as unknown)
        } catch {
          handler(message)
        }
      })
    }
    return this._subscriber
  }

  // ── Key utility ───────────────────────────────────────────────────────────

  /**
   * @description 파트들을 콜론(:)으로 연결해 Redis 키를 생성한다.
   * 빈 문자열 파트는 제외된다. 계층적 키 네이밍 컨벤션을 일관되게 유지할 때 사용한다.
   * 예: buildKey('user', '123', 'profile') → 'user:123:profile'
   */
  buildKey(...parts: string[]): string {
    return parts.filter(Boolean).join(':')
  }

  // ── Ping / Connection ─────────────────────────────────────────────────────

  /**
   * @description Redis 서버에 PING을 보내 연결 상태를 확인한다.
   * PONG 응답이 오면 true, 연결 실패나 에러 시 false를 반환한다.
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping()
      return result === 'PONG'
    } catch {
      return false
    }
  }

  /**
   * @description 내부 ioredis 인스턴스를 직접 반환한다.
   * ForgeRedisClient가 지원하지 않는 Redis 명령이 필요할 때 사용한다.
   */
  getClient(): Redis {
    return this.client
  }

  /**
   * @description Redis 연결을 종료한다.
   * subscribe 중인 전용 클라이언트가 있으면 함께 종료한다.
   */
  async disconnect(): Promise<void> {
    if (this._subscriber) {
      this._subscriber.disconnect()
      this._subscriber = null
    }
    this.client.disconnect()
  }
}

export function createRedisClient(options?: RedisOptions): ForgeRedisClient {
  return new ForgeRedisClient(options)
}
