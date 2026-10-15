import { Module, Global, Inject } from "@nestjs/common";
import type {
  DynamicModule,
  FactoryProvider,
  ModuleMetadata,
  OnApplicationShutdown,
} from "@nestjs/common";
import { ForgeRedisClient } from "../redis";
import type { RedisOptions } from "../redis.options";
import { REDIS_CLIENT, REDIS_OPTIONS } from "./redis.constants";

export interface RedisAsyncOptions extends Pick<ModuleMetadata, "imports"> {
  /** Nest `FactoryProvider`와 같은 시그니처 — `inject` 순서대로 들어오는 인자에 타입을 바로 적을 수 있다 */
  useFactory: FactoryProvider<RedisOptions>["useFactory"];
  inject?: FactoryProvider["inject"];
}

/**
 * @description `ForgeRedisClient`를 `REDIS_CLIENT` 토큰으로 전역 등록하는 동적 모듈.
 * 앱이 종료될 때(`app.close()`, 종료 신호 + `enableShutdownHooks()`) 연결을 닫는다 —
 * 닫지 않으면 ioredis 연결이 이벤트 루프를 붙잡아 프로세스가 끝나지 않는다
 * (Fastify 플러그인의 `onClose`와 같은 라이프사이클).
 */
@Global()
@Module({})
export class RedisModule implements OnApplicationShutdown {
  // esbuild(tsup)는 design:paramtypes를 방출하지 않으므로 주입 토큰을 명시한다
  constructor(@Inject(REDIS_CLIENT) private readonly client: ForgeRedisClient) {}

  /**
   * @description HTTP 서버가 닫힌 뒤(진행 중인 요청이 끝난 뒤) 호출되므로, 남은 명령 없이 연결을 닫을 수 있다.
   */
  async onApplicationShutdown(): Promise<void> {
    await this.client.disconnect();
  }

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
