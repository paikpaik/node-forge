import pino from "pino";
import type { LoggerOptions } from "./logger.options";
import type { RequestContext } from "../core";

/**
 * @description `pino`를 감싼 로거. NestJS의 `LoggerService`와 Fastify의 로깅 인터페이스를
 * 동일한 API로 사용할 수 있도록 `log`/`error`/`warn`/`debug`/`verbose` 등을 제공하며,
 * `withContext`로 요청별 컨텍스트(요청 ID 등)가 포함된 자식 로거를 만들 수 있다.
 */
export class ForgeLogger {
  private constructor(private readonly _pino: pino.Logger) {}

  /**
   * @description 옵션으로부터 `pino` 인스턴스를 생성해 `ForgeLogger`로 감싼다.
   * `options.pretty`가 true면 `pino-pretty` 트랜스포트를 붙여 로컬 개발 시 가독성을 높인다.
   */
  static create(options: LoggerOptions = {}): ForgeLogger {
    const instance = pino({
      level: options.level ?? "info",
      name: options.name,
      base: options.base ?? {},
      redact: options.redact,
      ...(options.pretty && {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard" },
        },
      }),
    });
    return new ForgeLogger(instance);
  }

  /**
   * @description 컨텍스트(요청 ID, 사용자 ID 등)가 항상 함께 기록되는 자식 로거를 만든다.
   * `pino.child`를 사용하므로 이후의 모든 로그 라인에 해당 필드가 자동으로 포함되어,
   * 요청 단위로 로그를 추적·필터링할 때 매 호출마다 컨텍스트를 넘기지 않아도 된다.
   */
  withContext(context: Partial<RequestContext> & Record<string, unknown>): ForgeLogger {
    return new ForgeLogger(this._pino.child(context));
  }

  /**
   * @description `info`와 동일하게 동작하는 별칭. NestJS `LoggerService` 인터페이스가
   * 요구하는 `log` 메서드 시그니처를 맞추기 위해 제공한다.
   */
  log(msg: string, data?: Record<string, unknown>): void {
    data ? this._pino.info(data, msg) : this._pino.info(msg);
  }

  info(msg: string, data?: Record<string, unknown>): void {
    data ? this._pino.info(data, msg) : this._pino.info(msg);
  }

  warn(msg: string, data?: Record<string, unknown>): void {
    data ? this._pino.warn(data, msg) : this._pino.warn(msg);
  }

  /**
   * @description 에러 로그를 남긴다. `error`는 `err` 필드로 직렬화되어 pino의 에러 포맷팅
   * (스택 트레이스 등)을 그대로 활용할 수 있으며, 추가 `data`는 `err`와 함께 병합된다.
   */
  error(msg: string, error?: unknown, data?: Record<string, unknown>): void {
    this._pino.error({ err: error, ...data }, msg);
  }

  debug(msg: string, data?: Record<string, unknown>): void {
    data ? this._pino.debug(data, msg) : this._pino.debug(msg);
  }

  /**
   * @description NestJS `LoggerService`의 `verbose` 레벨을 pino의 `trace` 레벨로 매핑한다.
   * pino에는 `verbose` 레벨이 없어 가장 낮은 `trace`로 대응시킨 것이다.
   */
  verbose(msg: string, data?: Record<string, unknown>): void {
    data ? this._pino.trace(data, msg) : this._pino.trace(msg);
  }
}

/**
 * @description `ForgeLogger.create`의 함수형 래퍼. 클래스의 정적 팩토리 메서드 대신
 * 함수 호출 스타일로 로거를 생성하고 싶을 때 사용한다 (동작은 완전히 동일).
 */
export function createLogger(options?: LoggerOptions): ForgeLogger {
  return ForgeLogger.create(options);
}
