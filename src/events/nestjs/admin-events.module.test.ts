import { describe, it, expect } from "vitest";
import {
  PATH_METADATA,
  SSE_METADATA,
  SELF_DECLARED_DEPS_METADATA,
} from "@nestjs/common/constants";
import { AdminEventsModule } from "./admin-events.module";
import { ADMIN_EVENT_BUS } from "./admin-events.constants";
import { AdminEventBus } from "../admin-event-bus";

describe("AdminEventsModule.forRoot", () => {
  it("ADMIN_EVENT_BUS 프로바이더와 동적 컨트롤러를 담은 DynamicModule을 반환한다", () => {
    const dynamicModule = AdminEventsModule.forRoot({ path: "admin/logs" });

    expect(dynamicModule.module).toBe(AdminEventsModule);
    expect(dynamicModule.exports).toEqual([ADMIN_EVENT_BUS]);
    expect(dynamicModule.controllers).toHaveLength(1);

    const provider = dynamicModule.providers?.[0] as { provide: symbol; useValue: unknown };
    expect(provider.provide).toBe(ADMIN_EVENT_BUS);
    expect(provider.useValue).toBeInstanceOf(AdminEventBus);
  });

  it("컨트롤러에 options.path를 라우트 prefix로 붙인다", () => {
    const dynamicModule = AdminEventsModule.forRoot({ path: "admin/logs" });
    const [Controller] = dynamicModule.controllers as [new (bus: AdminEventBus) => unknown];

    expect(Reflect.getMetadata(PATH_METADATA, Controller)).toBe("admin/logs");
  });

  it("stream 메서드에 @Sse('stream') 메타데이터가 붙는다", () => {
    const dynamicModule = AdminEventsModule.forRoot({ path: "admin/logs" });
    const [Controller] = dynamicModule.controllers as [
      new (bus: AdminEventBus) => { stream(): unknown },
    ];

    expect(Reflect.getMetadata(SSE_METADATA, Controller.prototype.stream)).toBe(true);
    expect(Reflect.getMetadata(PATH_METADATA, Controller.prototype.stream)).toBe("stream");
  });

  it("생성자 0번 파라미터에 @Inject(ADMIN_EVENT_BUS) 메타데이터가 명시되어 있다", () => {
    // esbuild(tsup)는 emitDecoratorMetadata의 design:paramtypes를 방출하지 않으므로,
    // 타입 추론이 아니라 self:paramtypes(@Inject 명시)로 주입 토큰이 남아있는지 확인한다
    // (RolesGuard에서 실제로 재현된 것과 같은 클래스의 버그를 원천 차단).
    const dynamicModule = AdminEventsModule.forRoot({ path: "admin/logs" });
    const [Controller] = dynamicModule.controllers as [new (bus: AdminEventBus) => unknown];

    const selfDeps = Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, Controller) ?? [];
    expect(selfDeps).toEqual(
      expect.arrayContaining([expect.objectContaining({ index: 0, param: ADMIN_EVENT_BUS })]),
    );
  });

  it("stream()이 반환한 Observable이 bus.emit()을 { data } 형태로 전달한다", () => {
    const dynamicModule = AdminEventsModule.forRoot({ path: "admin/logs" });
    const [Controller] = dynamicModule.controllers as [
      new (bus: AdminEventBus) => { stream(): { subscribe(fn: (v: unknown) => void): void } },
    ];
    const bus = (dynamicModule.providers?.[0] as { useValue: AdminEventBus }).useValue;
    const controller = new Controller(bus);

    const received: unknown[] = [];
    controller.stream().subscribe((event) => received.push(event));
    bus.emit({ type: "created" });

    expect(received).toEqual([{ data: { type: "created" } }]);
  });

  it("서로 다른 forRoot() 호출은 독립된 AdminEventBus 인스턴스를 만든다", () => {
    const a = AdminEventsModule.forRoot({ path: "admin/logs" });
    const b = AdminEventsModule.forRoot({ path: "admin/other" });

    const busA = (a.providers?.[0] as { useValue: unknown }).useValue;
    const busB = (b.providers?.[0] as { useValue: unknown }).useValue;
    expect(busA).not.toBe(busB);
  });
});
