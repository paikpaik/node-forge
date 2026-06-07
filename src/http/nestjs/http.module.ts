import { Module } from '@nestjs/common'
import type { DynamicModule, FactoryProvider, ModuleMetadata } from '@nestjs/common'
import { ForgeHttpClient } from '../http'
import type { HttpOptions } from '../http.options'
import { HTTP_CLIENT, HTTP_OPTIONS } from './http.constants'

export interface HttpAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  useFactory: (...args: unknown[]) => HttpOptions | Promise<HttpOptions>
  inject?: FactoryProvider['inject']
}

/**
 * @description `ForgeHttpClient`를 `HTTP_CLIENT` 토큰으로 등록하는 동적 모듈.
 * `LoggerModule`과 달리 `@Global()`이 아니므로, 사용할 모듈에서 직접 import해야 한다.
 * 정적 옵션은 `register`, 다른 모듈에 의존하는 비동기 옵션은 `registerAsync`를 사용한다.
 */
@Module({})
export class HttpModule {
  /**
   * @description 정적인 `HttpOptions`로 클라이언트를 구성한다.
   */
  static register(options: HttpOptions = {}): DynamicModule {
    return {
      module: HttpModule,
      providers: [
        { provide: HTTP_OPTIONS, useValue: options },
        {
          provide: HTTP_CLIENT,
          useFactory: (opts: HttpOptions) => new ForgeHttpClient(opts),
          inject: [HTTP_OPTIONS],
        },
      ],
      exports: [HTTP_CLIENT],
    }
  }

  /**
   * @description 다른 모듈에서 비동기로 가져온 값(baseURL, 인증 토큰 등)으로
   * `HttpOptions`를 구성해야 할 때 사용한다.
   */
  static registerAsync(asyncOptions: HttpAsyncOptions): DynamicModule {
    return {
      module: HttpModule,
      imports: asyncOptions.imports ?? [],
      providers: [
        {
          provide: HTTP_OPTIONS,
          useFactory: asyncOptions.useFactory,
          inject: asyncOptions.inject ?? [],
        },
        {
          provide: HTTP_CLIENT,
          useFactory: (opts: HttpOptions) => new ForgeHttpClient(opts),
          inject: [HTTP_OPTIONS],
        },
      ],
      exports: [HTTP_CLIENT],
    }
  }
}
