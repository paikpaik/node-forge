import { Injectable, OnApplicationBootstrap, Inject } from "@nestjs/common";
import { DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";
import { ForgeEventBus } from "../events";
import { EVENT_BUS, EVENTS_HANDLER_METADATA } from "./events.constants";

/**
 * @description 애플리케이션 부팅 시점에 모든 프로바이더를 스캔해 `@OnEvent`가 붙은 메서드를
 * 찾아 `ForgeEventBus`에 자동으로 리스너로 등록한다. 이 덕분에 사용하는 쪽은 `eventBus.on`을
 * 직접 호출하지 않고 `@OnEvent('...')` 데코레이터만 붙이면 된다 (`EventsModule`에서 자동 등록됨).
 * 모든 생성자 파라미터에 `@Inject()`를 명시하는 이유: node-forge는 esbuild(tsup)로 빌드되는데
 * esbuild는 `emitDecoratorMetadata`가 만드는 `design:paramtypes`를 방출하지 않는다 — 타입
 * 추론에만 의존하면 소스에서는 멀쩡해도 배포된 dist에서 Nest DI가 무엇을 주입할지 몰라
 * 런타임에 `undefined`가 주입된다(`RolesGuard`에서 실제로 재현된 것과 같은 원인).
 */
@Injectable()
export class EventsExplorer implements OnApplicationBootstrap {
  constructor(
    @Inject(DiscoveryService) private readonly discovery: DiscoveryService,
    @Inject(MetadataScanner) private readonly scanner: MetadataScanner,
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(EVENT_BUS) private readonly eventBus: ForgeEventBus,
  ) {}

  onApplicationBootstrap(): void {
    const providers = this.discovery.getProviders();

    for (const wrapper of providers) {
      const { instance } = wrapper;
      if (!instance || typeof instance !== "object") continue;

      const proto = Object.getPrototypeOf(instance) as Record<string, unknown>;
      if (!proto) continue;

      this.scanner.scanFromPrototype(instance, proto, (methodKey: string) => {
        const event = this.reflector.get<string>(
          EVENTS_HANDLER_METADATA,
          (instance as Record<string, unknown>)[methodKey] as object,
        );
        if (event) {
          this.eventBus.on(event, (...args: unknown[]) => {
            (instance as Record<string, (...a: unknown[]) => unknown>)[methodKey](...args);
          });
        }
      });
    }
  }
}
