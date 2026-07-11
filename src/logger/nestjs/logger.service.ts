import { Injectable, Inject } from "@nestjs/common";
import type { LoggerService } from "@nestjs/common";
import { ForgeLogger, createLogger } from "../logger";
import type { LoggerOptions } from "../logger.options";
import type { RequestContext } from "../../core";
import { LOGGER_OPTIONS } from "./logger.constants";

/**
 * @description `ForgeLogger`를 NestJS의 `LoggerService` 인터페이스에 맞게 어댑팅한 서비스.
 * `app.useLogger(service)` 또는 DI로 주입해 NestJS 내부 로깅까지 `ForgeLogger`(pino)로
 * 통일할 수 있다. 각 메서드는 Nest가 넘기는 `context`(보통 클래스/모듈명)를 구조화 필드로 변환해 위임한다.
 */
@Injectable()
export class ForgeLoggerService implements LoggerService {
  private readonly logger: ForgeLogger;

  constructor(@Inject(LOGGER_OPTIONS) options: LoggerOptions) {
    this.logger = createLogger(options);
  }

  log(message: string, context?: string): void {
    this.logger.info(message, context ? { context } : undefined);
  }

  /**
   * @description Nest가 전달하는 문자열 `trace`(스택 트레이스)를 `Error`로 감싸 `ForgeLogger.error`에
   * 위임한다. 이렇게 해야 pino의 에러 직렬화(스택 포맷팅 등)를 그대로 활용할 수 있다.
   */
  error(message: string, trace?: string, context?: string): void {
    this.logger.error(
      message,
      trace ? new Error(trace) : undefined,
      context ? { context } : undefined,
    );
  }

  warn(message: string, context?: string): void {
    this.logger.warn(message, context ? { context } : undefined);
  }

  debug(message: string, context?: string): void {
    this.logger.debug(message, context ? { context } : undefined);
  }

  verbose(message: string, context?: string): void {
    this.logger.verbose(message, context ? { context } : undefined);
  }

  /**
   * @description 내부 `ForgeLogger`의 `withContext`를 그대로 노출해, Nest 환경에서도
   * 요청 컨텍스트가 포함된 자식 로거를 얻을 수 있게 한다.
   */
  withContext(context: Partial<RequestContext>): ForgeLogger {
    return this.logger.withContext(context);
  }
}
