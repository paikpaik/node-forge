import { Module } from '@nestjs/common'
import type { DynamicModule, FactoryProvider, ModuleMetadata } from '@nestjs/common'
import { ForgeHttpClient } from '../http'
import type { HttpOptions } from '../http.options'
import { HTTP_CLIENT, HTTP_OPTIONS } from './http.constants'

export interface HttpAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  useFactory: (...args: unknown[]) => HttpOptions | Promise<HttpOptions>
  inject?: FactoryProvider['inject']
}

@Module({})
export class HttpModule {
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
