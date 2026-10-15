import { Module, Global } from "@nestjs/common";
import type { DynamicModule, FactoryProvider, ModuleMetadata } from "@nestjs/common";
import { ForgeRedisClient } from "../redis";
import type { RedisOptions } from "../redis.options";
import { REDIS_CLIENT, REDIS_OPTIONS } from "./redis.constants";

export interface RedisAsyncOptions extends Pick<ModuleMetadata, "imports"> {
  /** Nest `FactoryProvider`와 같은 시그니처 — `inject` 순서대로 들어오는 인자에 타입을 바로 적을 수 있다 */
  useFactory: FactoryProvider<RedisOptions>["useFactory"];
  inject?: FactoryProvider["inject"];
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
    };
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
    };
  }
}
