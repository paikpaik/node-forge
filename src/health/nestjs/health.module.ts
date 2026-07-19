import { Module } from "@nestjs/common";
import type { DynamicModule, FactoryProvider, ModuleMetadata } from "@nestjs/common";
import type { HealthChecker } from "../health";
import { HealthController } from "./health.controller";
import { HEALTH_CHECKERS, HEALTH_CACHE_MS } from "./health.constants";

export interface HealthModuleOptions {
  checkers: Record<string, HealthChecker>;
  /** 이 시간(ms) 안의 반복 요청은 체커를 다시 실행하지 않고 마지막 결과를 재사용한다. 생략하면 캐싱 없음(기존 동작). */
  cacheMs?: number;
}

export interface HealthAsyncOptions extends Pick<ModuleMetadata, "imports"> {
  useFactory: (
    ...args: unknown[]
  ) => Record<string, HealthChecker> | Promise<Record<string, HealthChecker>>;
  inject?: FactoryProvider["inject"];
  /** 이 시간(ms) 안의 반복 요청은 체커를 다시 실행하지 않고 마지막 결과를 재사용한다. 생략하면 캐싱 없음(기존 동작). */
  cacheMs?: number;
}

/**
 * @description `GET /health` 엔드포인트를 등록하는 동적 모듈. `forRoot`에 전달한 체커들이
 * `HealthController`에 주입되어 매 요청마다 실행된다. `LoggerModule`/`MetricsModule`과 달리
 * `@Global()`이 아니므로, 사용할 모듈에서 직접 import한다 (체커는 `database`/`redis` 같은
 * 다른 모듈의 인스턴스에 의존하므로 전역으로 미리 구성하기 어렵기 때문).
 */
@Module({})
export class HealthModule {
  static forRoot(options: HealthModuleOptions): DynamicModule {
    return {
      module: HealthModule,
      controllers: [HealthController],
      providers: [
        { provide: HEALTH_CHECKERS, useValue: options.checkers },
        ...(options.cacheMs !== undefined
          ? [{ provide: HEALTH_CACHE_MS, useValue: options.cacheMs }]
          : []),
      ],
    };
  }

  /**
   * @description 체커 구성이 다른 프로바이더(예: `RedisModule`이 만든 `ForgeRedisClient`)에
   * 의존할 때 사용한다. `useFactory`는 DI 컨테이너가 `inject`로 지정한 의존성을 모두 해석한
   * 뒤에 호출되므로, 체커 전용 인스턴스를 별도로 만들지 않고도 기존 프로바이더를 재사용할 수 있다.
   */
  static forRootAsync(asyncOptions: HealthAsyncOptions): DynamicModule {
    return {
      module: HealthModule,
      imports: asyncOptions.imports ?? [],
      controllers: [HealthController],
      providers: [
        {
          provide: HEALTH_CHECKERS,
          useFactory: asyncOptions.useFactory,
          inject: asyncOptions.inject ?? [],
        },
        ...(asyncOptions.cacheMs !== undefined
          ? [{ provide: HEALTH_CACHE_MS, useValue: asyncOptions.cacheMs }]
          : []),
      ],
    };
  }
}
