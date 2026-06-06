import { Injectable, OnApplicationBootstrap, Inject } from '@nestjs/common'
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core'
import { ForgeEventBus } from '../events'
import { EVENT_BUS, EVENTS_HANDLER_METADATA } from './events.constants'

@Injectable()
export class EventsExplorer implements OnApplicationBootstrap {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
    @Inject(EVENT_BUS) private readonly eventBus: ForgeEventBus,
  ) {}

  onApplicationBootstrap(): void {
    const providers = this.discovery.getProviders()

    for (const wrapper of providers) {
      const { instance } = wrapper
      if (!instance || typeof instance !== 'object') continue

      const proto = Object.getPrototypeOf(instance) as Record<string, unknown>
      if (!proto) continue

      this.scanner.scanFromPrototype(instance, proto, (methodKey: string) => {
        const event = this.reflector.get<string>(
          EVENTS_HANDLER_METADATA,
          (instance as Record<string, unknown>)[methodKey] as object,
        )
        if (event) {
          this.eventBus.on(event, (...args: unknown[]) => {
            ;(instance as Record<string, (...a: unknown[]) => unknown>)[methodKey](...args)
          })
        }
      })
    }
  }
}
