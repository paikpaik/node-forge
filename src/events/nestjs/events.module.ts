import { Module, Global } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { ForgeEventBus } from '../events'
import type { EventBusOptions } from '../events'
import { EventsExplorer } from './events.explorer'
import { EVENT_BUS } from './events.constants'

@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [
    {
      provide: EVENT_BUS,
      useFactory: (options?: EventBusOptions) => new ForgeEventBus(options),
    },
    EventsExplorer,
  ],
  exports: [EVENT_BUS],
})
export class EventsModule {}
