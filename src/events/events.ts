import EventEmitter2 from 'eventemitter2'

export interface EventBusOptions {
  wildcard?: boolean
  delimiter?: string
  maxListeners?: number
}

export type EventListener = (...args: unknown[]) => void | Promise<void>

export class ForgeEventBus {
  private readonly emitter: EventEmitter2

  constructor(options: EventBusOptions = {}) {
    this.emitter = new EventEmitter2({
      wildcard: options.wildcard ?? true,
      delimiter: options.delimiter ?? '.',
      maxListeners: options.maxListeners ?? 20,
    })
  }

  emit(event: string, ...args: unknown[]): boolean {
    return this.emitter.emit(event, ...args)
  }

  async emitAsync(event: string, ...args: unknown[]): Promise<unknown[]> {
    return this.emitter.emitAsync(event, ...args)
  }

  on(event: string, listener: EventListener): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void)
    return this
  }

  once(event: string, listener: EventListener): this {
    this.emitter.once(event, listener as (...args: unknown[]) => void)
    return this
  }

  off(event: string, listener: EventListener): this {
    this.emitter.off(event, listener as (...args: unknown[]) => void)
    return this
  }

  removeAllListeners(event?: string): this {
    this.emitter.removeAllListeners(event)
    return this
  }

  listenerCount(event: string): number {
    return this.emitter.listenerCount(event)
  }

  getEmitter(): EventEmitter2 {
    return this.emitter
  }
}

export function createEventBus(options?: EventBusOptions): ForgeEventBus {
  return new ForgeEventBus(options)
}
