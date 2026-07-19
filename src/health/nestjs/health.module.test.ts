import { describe, it, expect, vi } from "vitest";
import { HealthModule } from "./health.module";
import { HealthController } from "./health.controller";
import { HEALTH_CHECKERS, HEALTH_CACHE_MS } from "./health.constants";

describe("HealthModule.forRoot", () => {
  it("HealthController와 체커 프로바이더를 등록한 DynamicModule을 반환한다", () => {
    const checkers = { db: vi.fn().mockResolvedValue(undefined) };

    const dynamicModule = HealthModule.forRoot({ checkers });

    expect(dynamicModule.module).toBe(HealthModule);
    expect(dynamicModule.controllers).toEqual([HealthController]);
    expect(dynamicModule.providers).toEqual([{ provide: HEALTH_CHECKERS, useValue: checkers }]);
  });

  it("cacheMs를 지정하면 HEALTH_CACHE_MS 프로바이더를 추가한다", () => {
    const checkers = { db: vi.fn().mockResolvedValue(undefined) };

    const dynamicModule = HealthModule.forRoot({ checkers, cacheMs: 3_000 });

    expect(dynamicModule.providers).toEqual([
      { provide: HEALTH_CHECKERS, useValue: checkers },
      { provide: HEALTH_CACHE_MS, useValue: 3_000 },
    ]);
  });
});

describe("HealthModule.forRootAsync", () => {
  it("useFactory/inject로 체커 프로바이더를 등록한 DynamicModule을 반환한다", () => {
    const useFactory = vi.fn();
    const dynamicModule = HealthModule.forRootAsync({ useFactory, inject: ["REDIS_CLIENT"] });

    expect(dynamicModule.module).toBe(HealthModule);
    expect(dynamicModule.controllers).toEqual([HealthController]);
    expect(dynamicModule.providers).toEqual([
      { provide: HEALTH_CHECKERS, useFactory, inject: ["REDIS_CLIENT"] },
    ]);
  });

  it("imports/inject를 생략하면 빈 배열로 채운다", () => {
    const useFactory = vi.fn();
    const dynamicModule = HealthModule.forRootAsync({ useFactory });

    expect(dynamicModule.imports).toEqual([]);
    expect(dynamicModule.providers).toEqual([
      { provide: HEALTH_CHECKERS, useFactory, inject: [] },
    ]);
  });

  it("cacheMs를 지정하면 HEALTH_CACHE_MS 프로바이더를 추가한다", () => {
    const useFactory = vi.fn();
    const dynamicModule = HealthModule.forRootAsync({ useFactory, cacheMs: 3_000 });

    expect(dynamicModule.providers).toEqual([
      { provide: HEALTH_CHECKERS, useFactory, inject: [] },
      { provide: HEALTH_CACHE_MS, useValue: 3_000 },
    ]);
  });
});
