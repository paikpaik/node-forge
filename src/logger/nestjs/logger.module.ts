import { Module, Global } from '@nestjs/common'
import type { DynamicModule, FactoryProvider, ModuleMetadata } from '@nestjs/common'
import { ForgeLoggerService } from './logger.service'
import { LOGGER_OPTIONS } from './logger.constants'
import type { LoggerOptions } from '../logger.options'

export interface LoggerAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  useFactory: (...args: unknown[]) => LoggerOptions | Promise<LoggerOptions>
  inject?: FactoryProvider['inject']
}

@Global()
@Module({})
export class LoggerModule {
  static forRoot(options: LoggerOptions = {}): DynamicModule {
    return {
      module: LoggerModule,
      providers: [
        { provide: LOGGER_OPTIONS, useValue: options },
        ForgeLoggerService,
      ],
      exports: [ForgeLoggerService],
    }
  }

  static forRootAsync(asyncOptions: LoggerAsyncOptions): DynamicModule {
    return {
      module: LoggerModule,
      imports: asyncOptions.imports ?? [],
      providers: [
        {
          provide: LOGGER_OPTIONS,
          useFactory: asyncOptions.useFactory,
          inject: asyncOptions.inject ?? [],
        },
        ForgeLoggerService,
      ],
      exports: [ForgeLoggerService],
    }
  }
}
