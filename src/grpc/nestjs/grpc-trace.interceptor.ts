import { Inject, Injectable } from "@nestjs/common";
import type { CallHandler, ExecutionContext, NestInterceptor } from "@nestjs/common";
import type { Metadata } from "@grpc/grpc-js";
import type { Observable } from "rxjs";
import { tap, catchError } from "rxjs/operators";
import { parseTraceparent, runWithRequestContext } from "../../core";
import { ForgeLoggerService } from "../../logger/nestjs";

interface GrpcCallLike {
  getPath?: () => string;
}

/**
 * @description gRPC 서버 진입점(`@GrpcMethod`/`@GrpcStreamMethod`)에서 들어온 `Metadata`의
 * `traceparent`를 복원해(없으면 새로 발급) `runWithRequestContext`로 하위 실행 체인에
 * 전파하고, 처리 완료 시 access log를 남긴다. `logger/nestjs`의 `TraceAccessLogMiddleware`와
 * 짝을 이루는 gRPC 버전이라 `ForgeLoggerService`를 그대로 재사용한다(`LoggerModule`이
 * `@Global()`이므로 별도 import 없이 주입된다).
 */
@Injectable()
export class GrpcTraceAccessLogInterceptor implements NestInterceptor {
  constructor(@Inject(ForgeLoggerService) private readonly loggerService: ForgeLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metadata = context.switchToRpc().getContext<Metadata>();
    const call = context.getArgByIndex<GrpcCallLike>(2);
    const grpcMethod =
      call?.getPath?.() ?? `${context.getClass().name}.${context.getHandler().name}`;

    const rawTraceparent = metadata?.get?.("traceparent")?.[0];
    const parsed = typeof rawTraceparent === "string" ? parseTraceparent(rawTraceparent) : null;
    const traceId = parsed?.traceId ?? crypto.randomUUID();
    const requestId = crypto.randomUUID();

    const start = Date.now();
    const logger = this.loggerService.withContext({ traceId, requestId });
    const record = (status: "ok" | "error"): void => {
      logger.info("access", { grpcMethod, status, durationMs: Date.now() - start });
    };

    return runWithRequestContext({ traceId, requestId }, () =>
      next.handle().pipe(
        tap(() => record("ok")),
        catchError((err: unknown) => {
          record("error");
          throw err;
        }),
      ),
    );
  }
}
