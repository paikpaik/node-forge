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

@Global()
@Module({})
export class MetricsModule {
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
