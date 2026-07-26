import { Inject, Injectable } from "@nestjs/common";
import type { NestMiddleware } from "@nestjs/common";
import { buildTraceparent, parseTraceparent, runWithRequestContext } from "../../core";
import { ForgeLoggerService } from "./logger.service";

interface MinimalRequest {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  originalUrl?: string;
  url?: string;
  ip?: string;
}

interface MinimalResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  on(event: "finish", listener: () => void): void;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * @description `logger/fastify`의 `onRequest` 훅과 동일한 전략(들어온 `traceparent` 재사용,
 * 없으면 생성)을 NestJS 미들웨어로 제공한다. `ForgeLoggerService.withContext()`로 만든 요청별
 * 로거를 `runWithRequestContext`로 감싸 하위 실행 체인(컨트롤러/서비스/gRPC 클라이언트) 전체에
 * traceId/requestId를 전파하고, 응답이 끝나면 access log 한 줄을 남긴다. `traceparent`를
 * 응답 헤더에도 세팅해 클라이언트가 어떤 trace로 처리됐는지 확인할 수 있게 한다.
 *
 * @example
 * export class AppModule implements NestModule {
 *   configure(consumer: MiddlewareConsumer) {
 *     consumer.apply(TraceAccessLogMiddleware).forRoutes("*");
 *   }
 * }
 */
@Injectable()
export class TraceAccessLogMiddleware implements NestMiddleware {
  constructor(@Inject(ForgeLoggerService) private readonly loggerService: ForgeLoggerService) {}

  use(req: MinimalRequest, res: MinimalResponse, next: () => void): void {
    const rawTraceparent = firstHeaderValue(req.headers["traceparent"]);
    const traceId =
      (rawTraceparent ? parseTraceparent(rawTraceparent)?.traceId : undefined) ??
      firstHeaderValue(req.headers["x-trace-id"]) ??
      crypto.randomUUID();
    const requestId = firstHeaderValue(req.headers["x-request-id"]) ?? crypto.randomUUID();

    res.setHeader("traceparent", buildTraceparent(traceId));

    const start = Date.now();
    const context = { traceId, requestId, ip: req.ip };
    const logger = this.loggerService.withContext(context);

    runWithRequestContext(context, () => {
      res.on("finish", () => {
        logger.info("access", {
          method: req.method,
          path: req.originalUrl ?? req.url,
          status: res.statusCode,
          durationMs: Date.now() - start,
        });
      });
      next();
    });
  }
}
