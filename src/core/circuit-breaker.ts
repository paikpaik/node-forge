import { ForgeError } from "./errors";

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerOptions {
  /** OPEN으로 전환할 연속 실패 횟수 */
  failureThreshold: number;
  /** OPEN 상태를 유지할 ms — 이후 HALF_OPEN으로 전환해 복구를 시도한다 */
  resetTimeout: number;
  /** HALF_OPEN에서 CLOSED로 전환할 연속 성공 횟수. 기본값 1 */
  successThreshold?: number;
  /** ForgeError 메시지에 포함될 서킷 식별자. 기본값 'circuit' */
  name?: string;
  /** 상태 전환 시 호출되는 콜백. 로깅·메트릭 연결에 사용한다 */
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

export class ForgeCircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failures = 0;
  private successes = 0;
  private openedAt: number | null = null;

  private readonly cbName: string;
  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly successThreshold: number;
  private readonly onStateChangeCb?: (from: CircuitState, to: CircuitState) => void;

  constructor(options: CircuitBreakerOptions) {
    this.cbName = options.name ?? "circuit";
    this.failureThreshold = options.failureThreshold;
    this.resetTimeout = options.resetTimeout;
    this.successThreshold = options.successThreshold ?? 1;
    this.onStateChangeCb = options.onStateChange;
  }

  /**
   * @description fn을 실행한다. OPEN 상태이면 fn을 호출하지 않고 즉시 ForgeError('E9502')를 던진다.
   * resetTimeout이 경과한 OPEN 상태에서 execute를 호출하면 HALF_OPEN으로 전환하고 fn을 시도한다.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (Date.now() - this.openedAt! >= this.resetTimeout) {
        this.transition("HALF_OPEN");
      } else {
        throw new ForgeError("E9502", `Circuit is open: ${this.cbName}`);
      }
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /** @description 현재 서킷 상태를 반환한다. 사이드이펙트 없음. */
  getState(): CircuitState {
    return this.state;
  }

  /** @description 서킷을 강제로 CLOSED로 초기화한다. 장애 해소 후 수동 복구 시 사용한다. */
  reset(): void {
    this.transition("CLOSED");
  }

  private recordSuccess(): void {
    this.failures = 0;
    if (this.state === "HALF_OPEN") {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        this.transition("CLOSED");
      }
    }
  }

  private recordFailure(): void {
    this.failures++;
    if (this.state === "HALF_OPEN") {
      this.transition("OPEN");
    } else if (this.failures >= this.failureThreshold) {
      this.transition("OPEN");
    }
  }

  private transition(to: CircuitState): void {
    const from = this.state;
    this.state = to;
    if (to === "OPEN") {
      this.openedAt = Date.now();
      this.successes = 0;
    } else if (to === "CLOSED") {
      this.failures = 0;
      this.successes = 0;
      this.openedAt = null;
    } else if (to === "HALF_OPEN") {
      this.successes = 0;
    }
    this.onStateChangeCb?.(from, to);
  }
}
