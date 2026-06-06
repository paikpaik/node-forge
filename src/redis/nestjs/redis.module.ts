import { Module, Global } from '@nestjs/common'
import type { DynamicModule, FactoryProvider, ModuleMetadata } from '@nestjs/common'
import { ForgeRedisClient } from '../redis'
import type { RedisOptions } from '../redis.options'
import { REDIS_CLIENT, REDIS_OPTIONS } from './redis.constants'

export interface RedisAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  useFactory: (...args: unknown[]) => RedisOptions | Promise<RedisOptions>
  inject?: FactoryProvider['inject']
}

@Global()
@Module({})
export class RedisModule {
  static forRoot(options: RedisOptions = {}): DynamicModule {
    return {
      module: RedisModule,
      providers: [
        { provide: REDIS_OPTIONS, useValue: options },
        {
          provide: REDIS_CLIENT,
          useFactory: (opts: RedisOptions) => new ForgeRedisClient(opts),
          inject: [REDIS_OPTIONS],
        },
      ],
      exports: [REDIS_CLIENT],
    }
  }

  static forRootAsync(asyncOptions: RedisAsyncOptions): DynamicModule {
    return {
      module: RedisModule,
      imports: asyncOptions.imports ?? [],
      providers: [
        {
          provide: REDIS_OPTIONS,
          useFactory: asyncOptions.useFactory,
          inject: asyncOptions.inject ?? [],
        },
        {
          provide: REDIS_CLIENT,
          useFactory: (opts: RedisOptions) => new ForgeRedisClient(opts),
          inject: [REDIS_OPTIONS],
        },
      ],
      exports: [REDIS_CLIENT],
    }
  }
}
