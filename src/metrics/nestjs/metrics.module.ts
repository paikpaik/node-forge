import { Module, Global } from '@nestjs/common'
import type { DynamicModule, FactoryProvider, ModuleMetadata } from '@nestjs/common'
import { ForgeMetrics } from '../metrics'
import type { MetricsOptions } from '../metrics'
import { MetricsController } from './metrics.controller'
import { METRICS_INSTANCE, METRICS_OPTIONS } from './metrics.constants'

export interface MetricsAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  useFactory: (...args: unknown[]) => MetricsOptions | Promise<MetricsOptions>
  inject?: FactoryProvider['inject']
}

/**
 * @description `ForgeMetrics`를 `METRICS_INSTANCE` 토큰으로 전역 등록하고,
 * `MetricsController`를 통해 `/metrics` 엔드포인트를 자동으로 노출하는 동적 모듈.
 * `@Global()`이므로 한 번만 등록하면 앱 전체에서 메트릭 인스턴스를 주입받아 사용할 수 있다.
 */
@Global()
@Module({})
export class MetricsModule {
  /**
   * @description 정적인 `MetricsOptions`로 메트릭 모듈을 구성한다.
   */
  static forRoot(options: MetricsOptions = {}): DynamicModule {
    return {
      module: MetricsModule,
      controllers: [MetricsController],
      providers: [
        { provide: METRICS_OPTIONS, useValue: options },
        {
          provide: METRICS_INSTANCE,
          useFactory: (opts: MetricsOptions) => new ForgeMetrics(opts),
          inject: [METRICS_OPTIONS],
        },
      ],
      exports: [METRICS_INSTANCE],
    }
  }

  /**
   * @description 다른 모듈에서 비동기로 가져온 값(예: prefix, 기본 라벨)으로
   * `MetricsOptions`를 구성해야 할 때 사용한다.
   */
  static forRootAsync(asyncOptions: MetricsAsyncOptions): DynamicModule {
    return {
      module: MetricsModule,
      controllers: [MetricsController],
      imports: asyncOptions.imports ?? [],
      providers: [
        {
          provide: METRICS_OPTIONS,
          useFactory: asyncOptions.useFactory,
          inject: asyncOptions.inject ?? [],
        },
        {
          provide: METRICS_INSTANCE,
          useFactory: (opts: MetricsOptions) => new ForgeMetrics(opts),
          inject: [METRICS_OPTIONS],
        },
      ],
      exports: [METRICS_INSTANCE],
    }
  }
}
