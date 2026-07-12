import { Catch } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { ForgeBizError, ForgeHttpError } from "../../core/errors";
import { fail } from "../response";

/**
 * @description `ForgeBizError`/`ForgeHttpError`를 표준 `fail()` 포맷의 HTTP 응답으로 변환하는
 * 전역 필터. `ResponseInterceptor`와 짝을 이뤄 성공/실패 응답 포맷을 모두 표준화한다
 * (`app.useGlobalFilters(new ForgeExceptionFilter(app.get(HttpAdapterHost)))`로 등록).
 * `ForgeBizError`는 HTTP 상태 코드를 갖지 않으므로 400으로 매핑한다. 응답 전송은
 * `httpAdapter.reply`를 거쳐서, Express/Fastify 어댑터 어느 쪽에서도 동일하게 동작한다.
 */
@Catch(ForgeBizError, ForgeHttpError)
export class ForgeExceptionFilter implements ExceptionFilter {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: ForgeBizError | ForgeHttpError, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const response = host.switchToHttp().getResponse();
    const statusCode = exception instanceof ForgeHttpError ? exception.statusCode : 400;
    httpAdapter.reply(response, fail(exception.code, exception.message), statusCode);
  }
}
