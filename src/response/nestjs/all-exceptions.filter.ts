import { Catch, HttpException, Logger } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { throwError } from "rxjs";
import type { Observable } from "rxjs";
import { ForgeBizError, ForgeHttpError } from "../../core/errors";
import { fail } from "../response";
import type { ApiResponse } from "../response";

/** 예상하지 못한 예외에 쓰는 코드·메시지. 내부 정보(스택, SQL 등)가 클라이언트로 나가지 않게 고정 문구를 쓴다. */
export const UNHANDLED_ERROR_CODE = "E9500";
export const UNHANDLED_ERROR_MESSAGE = "Internal server error";

export interface ErrorReply {
  statusCode: number;
  body: ApiResponse<never>;
}

/** 4xx/5xx 범위의 정수인지 — 에러 응답으로 쓸 수 있는 상태 코드인지 판별한다. */
function isErrorStatus(statusCode: number): boolean {
  return Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599;
}

/**
 * @description HTTP 상태 코드를 node-forge 에러 코드 컨벤션으로 바꾼다.
 * `E9` + 상태 코드라서 4xx는 자연스럽게 `E94xx`(클라이언트 오류), 5xx는 `E95xx`(서버 오류)가 된다
 * (404 → `E9404`, 503 → `E9503`). 4xx/5xx가 아닌 값은 `E9500`으로 취급한다.
 */
export function httpStatusToErrorCode(statusCode: number): string {
  return isErrorStatus(statusCode) ? `E9${statusCode}` : UNHANDLED_ERROR_CODE;
}

/**
 * @description `toErrorReply`가 의도된 예외로 변환하는 타입인지 판별한다 (Forge 에러, Nest `HttpException`).
 * 이 밖의 예외는 500 `E9500`으로 감춰지고 스택이 서버 로그에 남는다.
 */
export function isExpectedException(
  exception: unknown,
): exception is ForgeHttpError | ForgeBizError | HttpException {
  return (
    exception instanceof ForgeHttpError ||
    exception instanceof ForgeBizError ||
    exception instanceof HttpException
  );
}

/**
 * @description 어떤 예외든 `{ statusCode, body: fail(code, message) }`로 변환한다.
 * - `ForgeHttpError` → 자신의 statusCode·code
 * - `ForgeBizError` → 400, 자신의 code
 * - Nest `HttpException`(NotFoundException, 라우트 없음 404, ValidationPipe 400 등) → 상태 코드 유지, code는 `httpStatusToErrorCode`
 *   (4xx/5xx가 아닌 상태로 던져진 경우 code와 맞도록 500으로 응답)
 * - 그 외 → 500 `E9500`, 메시지는 고정 문구 (원래 메시지는 서버 로그에만 남긴다)
 */
export function toErrorReply(exception: unknown): ErrorReply {
  if (exception instanceof ForgeHttpError) {
    return { statusCode: exception.statusCode, body: fail(exception.code, exception.message) };
  }

  if (exception instanceof ForgeBizError) {
    return { statusCode: 400, body: fail(exception.code, exception.message) };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const statusCode = isErrorStatus(status) ? status : 500;
    return {
      statusCode,
      body: fail(httpStatusToErrorCode(statusCode), httpExceptionMessage(exception)),
    };
  }

  return { statusCode: 500, body: fail(UNHANDLED_ERROR_CODE, UNHANDLED_ERROR_MESSAGE) };
}

/**
 * Nest `HttpException`의 응답 본문은 문자열이거나 `{ message: string | string[] }` 객체다
 * (ValidationPipe는 필드별 메시지를 배열로 담는다). 배열이면 한 줄로 합친다.
 */
function httpExceptionMessage(exception: HttpException): string {
  const response = exception.getResponse();

  if (typeof response === "string") {
    return response;
  }

  if (response !== null && typeof response === "object" && "message" in response) {
    const { message } = response as { message: unknown };
    if (Array.isArray(message)) {
      return message.map(String).join(", ");
    }
    if (typeof message === "string") {
      return message;
    }
  }

  return exception.message;
}

/**
 * 응답에서는 빠지는 상세 정보 — HttpException의 원래 본문(헬스체크 리포트 등), ForgeHttpError의 `cause`.
 * 5xx 원인 추적용으로 로그에만 남긴다.
 */
function exceptionDetail(exception: ForgeHttpError | ForgeBizError | HttpException): unknown {
  return exception instanceof HttpException ? exception.getResponse() : exception.cause;
}

/**
 * @description 모든 예외를 표준 `fail()` 포맷으로 응답하는 전역 필터.
 * `ForgeExceptionFilter`는 Forge 에러만 잡기 때문에 404(없는 경로), 400(ValidationPipe),
 * 503(헬스체크 실패), 예상하지 못한 500 같은 Nest 기본 예외는 Nest 기본 포맷
 * (`{ statusCode, message, error }`)으로 나간다. 클라이언트가 응답 포맷 하나만 처리하게 하려면
 * `ForgeExceptionFilter` 대신 이 필터를 등록한다
 * (`app.useGlobalFilters(new ForgeAllExceptionsFilter(app.get(HttpAdapterHost)))`).
 *
 * 로그: 예상하지 못한 예외는 `error`(스택 포함), 의도된 예외라도 5xx면 응답에서 빠진 상세
 * (HttpException 본문, ForgeHttpError `cause`)를 `warn`으로 남긴다 — 503 헬스 실패 시 어떤 체크가
 * 실패했는지 등을 서버 로그로 확인할 수 있게.
 *
 * HTTP 전용이다. HTTP가 아닌 컨텍스트(gRPC 하이브리드에서 `inheritAppConfig: true` 등)에서는
 * 변환하지 않고 예외를 그대로 전달한다.
 */
@Catch()
export class ForgeAllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ForgeAllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void | Observable<never> {
    if (host.getType() !== "http") {
      return throwError(() => exception);
    }

    const { httpAdapter } = this.httpAdapterHost;
    const response = host.switchToHttp().getResponse();
    const { statusCode, body } = toErrorReply(exception);

    if (!isExpectedException(exception)) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(`처리되지 않은 예외: ${String(exception)}`, stack);
    } else if (statusCode >= 500) {
      const detail = exceptionDetail(exception);
      this.logger.warn(
        `${statusCode} ${body.error?.code}: ${exception.message}` +
          (detail === undefined ? "" : ` ${stringify(detail)}`),
      );
    }

    httpAdapter.reply(response, body, statusCode);
  }
}

function stringify(value: unknown): string {
  if (value instanceof Error) {
    return value.stack ?? String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
