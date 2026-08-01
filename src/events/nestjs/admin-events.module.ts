import { Controller, Inject, Module, Sse } from "@nestjs/common";
import type { DynamicModule, MessageEvent } from "@nestjs/common";
import { map } from "rxjs/operators";
import type { Observable } from "rxjs";
import { AdminEventBus } from "../admin-event-bus";
import { ADMIN_EVENT_BUS } from "./admin-events.constants";

export interface AdminEventsModuleOptions {
  /** SSE 엔드포인트 경로. 예: "admin/logs" → GET /admin/logs/stream */
  path: string;
}

/**
 * @description `ADMIN_EVENT_BUS` 토큰으로 등록한 `AdminEventBus`와, 그 `stream$`을
 * `<path>/stream`에 `@Sse()`로 노출하는 컨트롤러를 함께 등록하는 동적 모듈. 컨트롤러의 라우트
 * prefix(`path`)는 등록 시점에만 정해질 수 있어, `@Controller(path)`를 클래스 선언 문법이
 * 아니라 함수 호출로 직접 적용해 동적으로 만든다. 도메인 서비스는
 * `@Inject(ADMIN_EVENT_BUS) events: AdminEventBus<MyEvent>`로 주입받아 `emit()`만 호출하면 된다.
 */
@Module({})
export class AdminEventsModule {
  static forRoot(options: AdminEventsModuleOptions): DynamicModule {
    class AdminEventsController {
      constructor(@Inject(ADMIN_EVENT_BUS) private readonly bus: AdminEventBus) {}

      @Sse("stream")
      stream(): Observable<MessageEvent> {
        return this.bus.stream$.pipe(map((event) => ({ data: event }) as MessageEvent));
      }
    }
    Controller(options.path)(AdminEventsController);

    return {
      module: AdminEventsModule,
      controllers: [AdminEventsController],
      providers: [{ provide: ADMIN_EVENT_BUS, useValue: new AdminEventBus() }],
      exports: [ADMIN_EVENT_BUS],
    };
  }
}
