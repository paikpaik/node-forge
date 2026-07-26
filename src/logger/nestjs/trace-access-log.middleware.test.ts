import { describe, it, expect, vi } from "vitest";
import { TraceAccessLogMiddleware } from "./trace-access-log.middleware";
import { getRequestContext } from "../../core";
import type { ForgeLoggerService } from "./logger.service";

function makeLoggerService(): { service: ForgeLoggerService; info: ReturnType<typeof vi.fn> } {
  const info = vi.fn();
  const service = { withContext: () => ({ info }) } as unknown as ForgeLoggerService;
  return { service, info };
}

function makeRequest(headers: Record<string, string | string[] | undefined> = {}) {
  return { headers, method: "GET", originalUrl: "/users/1", ip: "127.0.0.1" };
}

function makeResponse() {
  const listeners: Record<string, () => void> = {};
  return {
    statusCode: 200,
    setHeader: vi.fn(),
    on: (event: "finish", listener: () => void) => {
      listeners[event] = listener;
    },
    triggerFinish: () => listeners.finish?.(),
  };
}

describe("TraceAccessLogMiddleware", () => {
  it("traceparent 헤더가 없으면 새로 생성해 응답 헤더에 세팅한다", () => {
    const { service } = makeLoggerService();
    const middleware = new TraceAccessLogMiddleware(service);
    const res = makeResponse();

    middleware.use(makeRequest(), res, () => {});

    expect(res.setHeader).toHaveBeenCalledWith("traceparent", expect.stringMatching(/^00-/));
  });

  it("들어온 traceparent의 traceId를 재사용한다", () => {
    const { service } = makeLoggerService();
    const middleware = new TraceAccessLogMiddleware(service);
    const res = makeResponse();
    const traceparent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";

    middleware.use(makeRequest({ traceparent }), res, () => {});

    expect(res.setHeader).toHaveBeenCalledWith(
      "traceparent",
      expect.stringContaining("4bf92f3577b34da6a3ce929d0e0e4736"),
    );
  });

  it("next() 아래의 동기 실행에 요청 컨텍스트를 전파한다", () => {
    const { service } = makeLoggerService();
    const middleware = new TraceAccessLogMiddleware(service);
    const res = makeResponse();
    let captured: ReturnType<typeof getRequestContext>;

    middleware.use(makeRequest(), res, () => {
      captured = getRequestContext();
    });

    expect(captured?.traceId).toMatch(/^[\da-f]{32}$/);
    expect(captured?.requestId).toBeDefined();
  });

  it("응답이 끝나면 method/path/status/durationMs/traceId/requestId를 담은 access log를 남긴다", () => {
    const { service, info } = makeLoggerService();
    const middleware = new TraceAccessLogMiddleware(service);
    const res = makeResponse();
    res.statusCode = 201;

    middleware.use(makeRequest(), res, () => {});
    res.triggerFinish();

    expect(info).toHaveBeenCalledWith(
      "access",
      expect.objectContaining({
        method: "GET",
        path: "/users/1",
        status: 201,
        durationMs: expect.any(Number),
      }),
    );
  });
});
