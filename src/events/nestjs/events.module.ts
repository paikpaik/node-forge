import { Module, Global } from "@nestjs/common";
import { DiscoveryModule } from "@nestjs/core";
import { ForgeEventBus } from "../events";
import type { EventBusOptions } from "../events";
import { EventsExplorer } from "./events.explorer";
import { EVENT_BUS } from "./events.constants";

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
/**
 * @description `ForgeEventBus`를 `EVENT_BUS` 토큰으로 전역 등록하고, `EventsExplorer`를 통해
 * `@OnEvent` 데코레이터가 붙은 메서드를 자동으로 리스너로 연결한다. `@Global()`이므로
 * 한 번만 import하면 앱 전체에서 이벤트 버스를 주입받아 사용할 수 있다.
 */
export class EventsModule {}
