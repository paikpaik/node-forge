import EventEmitter2 from 'eventemitter2'

export interface EventBusOptions {
  wildcard?: boolean
  delimiter?: string
  maxListeners?: number
}

export type EventListener = (...args: unknown[]) => void | Promise<void>

/**
 * @description `eventemitter2`를 감싼 이벤트 버스. 기본적으로 `wildcard: true`,
 * `delimiter: '.'`로 동작해 `'order.*'`처럼 네임스페이스 패턴 구독이 가능하다
 * (모듈 간 직접 의존 없이 도메인 이벤트를 주고받는 느슨한 결합 구조에 사용한다).
 */
export class ForgeEventBus {
  private readonly emitter: EventEmitter2

  constructor(options: EventBusOptions = {}) {
    this.emitter = new EventEmitter2({
      wildcard: options.wildcard ?? true,
      delimiter: options.delimiter ?? '.',
      maxListeners: options.maxListeners ?? 20,
    })
  }

  /**
   * @description 동기적으로 이벤트를 발행한다. 등록된 리스너가 하나라도 있었으면 `true`를 반환한다.
   * 리스너가 비동기 함수여도 결과를 기다리지 않으므로, 완료를 보장해야 하면 `emitAsync`를 사용한다.
   */
  emit(event: string, ...args: unknown[]): boolean {
    return this.emitter.emit(event, ...args)
  }

  /**
   * @description 이벤트를 발행하고 모든 리스너(비동기 포함)의 처리가 끝날 때까지 기다린다.
   * 각 리스너의 반환값을 배열로 모아 반환하며, 발행 이후 동작이 리스너 완료에 의존할 때 사용한다.
   */
  async emitAsync(event: string, ...args: unknown[]): Promise<unknown[]> {
    return this.emitter.emitAsync(event, ...args)
  }

  /**
   * @description 이벤트 리스너를 등록한다. 메서드 체이닝을 위해 `this`를 반환한다.
   */
  on(event: string, listener: EventListener): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void)
    return this
  }

  /**
   * @description 이벤트 핸들러를 한 번만 실행되도록 등록한다. 등록 직후 첫 호출에서
   * 자동으로 해제되며, 초기화 작업처럼 1회성 트리거가 필요한 곳에 사용한다.
   */
  once(event: string, listener: EventListener): this {
    this.emitter.once(event, listener as (...args: unknown[]) => void)
    return this
  }

  /**
   * @description 등록된 리스너를 제거한다. `on`/`once`에 넘긴 것과 동일한 함수 참조여야
   * 정상적으로 해제된다 (익명 함수로 등록하면 해제할 수 없으므로 주의).
   */
  off(event: string, listener: EventListener): this {
    this.emitter.off(event, listener as (...args: unknown[]) => void)
    return this
  }

  /**
   * @description 특정 이벤트(또는 `event`를 생략하면 전체)의 모든 리스너를 제거한다.
   * 모듈 종료/재초기화 시 리스너 누수를 막기 위한 정리 용도로 사용한다.
   */
  removeAllListeners(event?: string): this {
    this.emitter.removeAllListeners(event)
    return this
  }

  listenerCount(event: string): number {
    return this.emitter.listenerCount(event)
  }

  /**
   * @description 내부에서 사용하는 원본 `EventEmitter2`에 직접 접근한다. `ForgeEventBus`가
   * 감싸지 않은 고급 기능(예: `onAny`, namespaces 조회 등)이 필요할 때 사용한다.
   */
  getEmitter(): EventEmitter2 {
    return this.emitter
  }
}

/**
 * @description `ForgeEventBus`의 함수형 래퍼. `new` 없이 옵션으로 이벤트 버스를 생성하고
 * 싶을 때 사용한다 (동작은 `new ForgeEventBus(options)`와 동일).
 */
export function createEventBus(options?: EventBusOptions): ForgeEventBus {
  return new ForgeEventBus(options)
}
