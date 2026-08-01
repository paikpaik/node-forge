import type { ForgeRedisClient } from "./redis";
import type { CircuitState } from "../core/circuit-breaker";
import { ForgeError } from "../core/errors";

export interface DistributedCircuitBreakerOptions {
  /** OPEN으로 전환할 연속 실패 횟수 */
  failureThreshold: number;
  /** OPEN 상태를 유지할 ms — 이후 HALF_OPEN으로 간주해 복구를 시도한다 */
  resetTimeout: number;
  /** HALF_OPEN → CLOSED 전환에 필요한 연속 성공 횟수. 기본값 1(ForgeCircuitBreaker와 동일) */
  successThreshold?: number;
  /** Redis 키 네임스페이스. 기본값 "circuit". `name`과 달리 회로 하나의 식별자가 아니라(그건
   * 매 호출의 key가 담당), 같은 Redis를 공유하는 여러 앱의 키 충돌을 막는 접두사다. */
  keyPrefix?: string;
  /** 실제로 Redis에 상태 쓰기가 일어난 순간(CLOSED→OPEN, OPEN→CLOSED)에만 호출된다.
   * HALF_OPEN은 getState()가 읽는 시점에 계산만 하고 저장하지 않으므로, "누군가 HALF_OPEN을
   * 읽었다"는 이 콜백을 트리거하지 않는다 — 실제로 상태가 바뀐 이벤트만 관측하고 싶을 때 사용한다. */
  onStateChange?: (key: string, from: CircuitState, to: CircuitState) => void;
}

interface CircuitRecord {
  state: CircuitState;
  failures: number;
  successes: number;
  openedAt: number | null;
}

const DEFAULT_KEY_PREFIX = "circuit";

/**
 * @description `ForgeCircuitBreaker`가 "인스턴스 하나 = 회로 하나"인 순수 인메모리 클래스인
 * 것과 달리, 이 클래스는 회로 상태를 Redis 해시에 저장해 여러 인스턴스가 "같은 key = 같은
 * 회로"를 공유한다. 보호 대상(엔드포인트, 다운스트림 서비스 등)이 런타임에 동적으로 늘어나는
 * 경우를 위한 것이라, 회로마다 별도 인스턴스를 만드는 대신 `key`로 회로를 구분한다.
 * HALF_OPEN 진입 시 탐색 요청을 하나로 조율하지는 않는다 — resetTimeout이 지나면 모든
 * 인스턴스가 동시에 재시도하고, 실패하면 다시 OPEN·성공하면 CLOSED로 단순하게 처리한다.
 */
export class DistributedCircuitBreaker {
  private readonly keyPrefix: string;

  constructor(
    private readonly redis: ForgeRedisClient,
    private readonly options: DistributedCircuitBreakerOptions,
  ) {
    this.keyPrefix = options.keyPrefix ?? DEFAULT_KEY_PREFIX;
  }

  /**
   * @description key가 가리키는 회로의 현재 상태를 읽는다. 저장된 상태가 OPEN이고
   * resetTimeout이 지났으면, 별도의 쓰기 없이 HALF_OPEN으로 간주해 반환한다 — 실제 상태
   * 전이(state 필드 갱신)는 recordSuccess/recordFailure가 호출될 때 이뤄진다.
   */
  async getState(key: string): Promise<CircuitState> {
    const record = await this.readRecord(key);
    return this.effectiveState(record);
  }

  /**
   * @description 성공을 기록한다. 현재 상태가 CLOSED면 실패 카운터만 정리하고 끝난다(실제
   * 상태 전이는 없으므로 onStateChange를 호출하지 않는다). OPEN(HALF_OPEN 포함 — 저장된
   * 값은 항상 OPEN이고 HALF_OPEN은 읽을 때만 계산된다)이면 성공 카운터를 HINCRBY로 원자
   * 증가시키고, successThreshold 이상이면 그때만 실제로 CLOSED로 전환하며
   * `onStateChange(key, "OPEN", "CLOSED")`를 호출한다.
   */
  async recordSuccess(key: string): Promise<void> {
    const redisKey = this.buildKey(key);
    const record = await this.readRecord(key);

    if (record.state === "CLOSED") {
      if (record.failures !== 0) {
        await this.redis.hmset(redisKey, { failures: 0 });
      }
      return;
    }

    const successes = await this.redis.hincrby(redisKey, "successes", 1);
    if (successes >= (this.options.successThreshold ?? 1)) {
      await this.redis.hmset(redisKey, {
        state: "CLOSED",
        failures: 0,
        successes: 0,
        openedAt: null,
      });
      this.options.onStateChange?.(key, "OPEN", "CLOSED");
    }
  }

  /**
   * @description 실패를 기록한다. 이미 OPEN(HALF_OPEN 탐색 실패 포함)이면 `ForgeCircuitBreaker`와
   * 동일하게 즉시 재개방(openedAt 갱신)하고 `onStateChange(key, "OPEN", "OPEN")`을 호출한다 —
   * 상태 라벨은 그대로지만 reset-timeout 시계를 다시 돌린다는 의미다. CLOSED였다면 실패
   * 카운터를 HINCRBY로 원자 증가시키고(여러 인스턴스가 동시에 호출해도 레이스 없음),
   * failureThreshold 이상이면 OPEN으로 전환하며 `onStateChange(key, "CLOSED", "OPEN")`을 호출한다.
   */
  async recordFailure(key: string): Promise<{ state: CircuitState }> {
    const redisKey = this.buildKey(key);
    const record = await this.readRecord(key);

    if (record.state === "OPEN") {
      await this.redis.hmset(redisKey, { state: "OPEN", successes: 0, openedAt: Date.now() });
      this.options.onStateChange?.(key, "OPEN", "OPEN");
      return { state: "OPEN" };
    }

    const failures = await this.redis.hincrby(redisKey, "failures", 1);
    if (failures >= this.options.failureThreshold) {
      await this.redis.hmset(redisKey, { state: "OPEN", successes: 0, openedAt: Date.now() });
      this.options.onStateChange?.(key, "CLOSED", "OPEN");
      return { state: "OPEN" };
    }

    return { state: "CLOSED" };
  }

  /**
   * @description fn을 실행한다. 회로가 OPEN이면 fn을 호출하지 않고 즉시
   * `ForgeError('E9502')`를 던진다(`ForgeCircuitBreaker.execute`와 동일한 에러 코드로
   * 일관성을 유지한다). 성공하면 recordSuccess로 리셋하고, 실패하면 recordFailure로
   * 카운터를 올린 뒤 원본 에러를 그대로 다시 던진다.
   */
  async execute<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const state = await this.getState(key);
    if (state === "OPEN") {
      throw new ForgeError("E9502", `Circuit is open: ${this.keyPrefix}:${key}`);
    }

    try {
      const result = await fn();
      await this.recordSuccess(key);
      return result;
    } catch (err) {
      await this.recordFailure(key);
      throw err;
    }
  }

  private buildKey(key: string): string {
    return `${this.keyPrefix}:${key}`;
  }

  /**
   * @description 저장된 record가 OPEN이고 resetTimeout이 지났으면 HALF_OPEN으로 간주해
   * 반환한다. 저장 값 자체(record.state)는 건드리지 않는 순수 계산이다.
   */
  private effectiveState(record: CircuitRecord): CircuitState {
    if (record.state === "OPEN" && record.openedAt !== null) {
      const elapsed = Date.now() - record.openedAt;
      if (elapsed >= this.options.resetTimeout) return "HALF_OPEN";
    }
    return record.state;
  }

  private async readRecord(key: string): Promise<CircuitRecord> {
    const raw = await this.redis.hgetall<string | number>(this.buildKey(key));
    if (!raw) return { state: "CLOSED", failures: 0, successes: 0, openedAt: null };
    return {
      state: (raw.state as CircuitState | undefined) ?? "CLOSED",
      failures: Number(raw.failures ?? 0),
      successes: Number(raw.successes ?? 0),
      openedAt: raw.openedAt ? Number(raw.openedAt) : null,
    };
  }
}
