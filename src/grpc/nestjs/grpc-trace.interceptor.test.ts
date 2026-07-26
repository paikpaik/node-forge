import { describe, it, expect, vi } from "vitest";
import { of, throwError, lastValueFrom } from "rxjs";
import type { ExecutionContext, CallHandler } from "@nestjs/common";
import { Metadata } from "@grpc/grpc-js";
import { GrpcTraceAccessLogInterceptor } from "./grpc-trace.interceptor";
import { getRequestContext } from "../../core";
import type { ForgeLoggerService } from "../../logger/nestjs";

function makeLoggerService(): { service: ForgeLoggerService; info: ReturnType<typeof vi.fn> } {
  const info = vi.fn();
  const service = { withContext: () => ({ info }) } as unknown as ForgeLoggerService;
  return { service, info };
}

function makeContext(metadata: Metadata, path = "/inventory.InventoryService/Reserve"): ExecutionContext {
  const args = [{}, metadata, { getPath: () => path }];
  return {
    switchToRpc: () => ({ getContext: () => metadata }),
    getArgByIndex: (index: number) => args[index],
    getClass: () => ({ name: "InventoryController" }),
    getHandler: () => ({ name: "reserve" }),
  } as unknown as ExecutionContext;
}

function makeHandler(value: unknown): CallHandler {
  return { handle: () => of(value) };
}

function makeErrorHandler(err: unknown): CallHandler {
  return { handle: () => throwError(() => err) };
}

describe("GrpcTraceAccessLogInterceptor", () => {
  it("들어온 metadata의 traceparent를 재사용해 하위 실행 체인에 전파한다", async () => {
    const { service } = makeLoggerService();
    const interceptor = new GrpcTraceAccessLogInterceptor(service);
    const metadata = new Metadata();
    metadata.set("traceparent", "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01");

    let captured: ReturnType<typeof getRequestContext>;
    const handler: CallHandler = {
      handle: () => {
        captured = getRequestContext();
        return of("ok");
      },
    };

    await lastValueFrom(interceptor.intercept(makeContext(metadata), handler));

    expect(captured?.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
  });

  it("traceparent가 없으면 새 traceId를 발급한다", async () => {
    const { service } = makeLoggerService();
    const interceptor = new GrpcTraceAccessLogInterceptor(service);
    const metadata = new Metadata();

    let captured: ReturnType<typeof getRequestContext>;
    const handler: CallHandler = {
      handle: () => {
        captured = getRequestContext();
        return of("ok");
      },
    };

    await lastValueFrom(interceptor.intercept(makeContext(metadata), handler));

    expect(captured?.traceId).toMatch(/^[\da-f]{32}$/);
  });

  it("정상 처리 시 grpcMethod/status/durationMs를 담아 ok로 access log를 남긴다", async () => {
    const { service, info } = makeLoggerService();
    const interceptor = new GrpcTraceAccessLogInterceptor(service);

    await lastValueFrom(interceptor.intercept(makeContext(new Metadata()), makeHandler("ok")));

    expect(info).toHaveBeenCalledWith(
      "access",
      expect.objectContaining({
        grpcMethod: "/inventory.InventoryService/Reserve",
        status: "ok",
        durationMs: expect.any(Number),
      }),
    );
  });

  it("에러 발생 시 status: error로 access log를 남기고 에러를 그대로 던진다", async () => {
    const { service, info } = makeLoggerService();
    const interceptor = new GrpcTraceAccessLogInterceptor(service);
    const error = new Error("boom");

    await expect(
      lastValueFrom(interceptor.intercept(makeContext(new Metadata()), makeErrorHandler(error))),
    ).rejects.toThrow("boom");

    expect(info).toHaveBeenCalledWith("access", expect.objectContaining({ status: "error" }));
  });
});
