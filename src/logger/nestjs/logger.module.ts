import { Module, Global } from "@nestjs/common";
import type { DynamicModule, FactoryProvider, ModuleMetadata } from "@nestjs/common";
import { ForgeLoggerService } from "./logger.service";
import { LOGGER_OPTIONS } from "./logger.constants";
import type { LoggerOptions } from "../logger.options";

export interface LoggerAsyncOptions extends Pick<ModuleMetadata, "imports"> {
  useFactory: (...args: unknown[]) => LoggerOptions | Promise<LoggerOptions>;
  inject?: FactoryProvider["inject"];
}

/**
 * @description `ForgeLoggerService`를 전역 프로바이더로 등록하는 동적 모듈.
 * `@Global()`이라 한 번만 `forRoot`/`forRootAsync`로 등록하면 앱 전체에서 별도 import 없이
 * 주입받아 사용할 수 있다. 옵션을 정적으로 줄 수 없을 때(다른 모듈의 설정값에 의존할 때)는
 * `forRootAsync`로 비동기 팩토리를 사용한다.
 */
@Global()
@Module({})
export class LoggerModule {
  /**
   * @description 정적인 `LoggerOptions`로 로거 모듈을 구성한다. 별도 설정이 필요 없는
   * 일반적인 경우에 사용한다.
   */
  static forRoot(options: LoggerOptions = {}): DynamicModule {
    return {
      module: LoggerModule,
      providers: [{ provide: LOGGER_OPTIONS, useValue: options }, ForgeLoggerService],
      exports: [ForgeLoggerService],
    };
  }

  /**
   * @description 다른 모듈(예: `ConfigModule`)에서 비동기로 가져온 값으로 `LoggerOptions`를
   * 구성해야 할 때 사용한다. `useFactory`/`inject`로 의존성을 주입받아 옵션을 생성한다.
   */
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
    };
  }
}
