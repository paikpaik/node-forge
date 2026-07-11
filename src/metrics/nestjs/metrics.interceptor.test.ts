import { describe, it, expect, beforeEach } from "vitest";
import { of, throwError, lastValueFrom } from "rxjs";
import type { ExecutionContext, CallHandler } from "@nestjs/common";
import { ForgeMetrics } from "../metrics";
import { MetricsInterceptor } from "./metrics.interceptor";

function makeContext(overrides: {
  method?: string;
  routePath?: string;
  url?: string;
  statusCode?: number;
}): ExecutionContext {
  const req = {
    method: overrides.method ?? "GET",
    route: overrides.routePath ? { path: overrides.routePath } : undefined,
    url: overrides.url ?? "/unknown",
  };
  const res = { statusCode: overrides.statusCode ?? 200 };
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
}

function makeHandler(value: unknown): CallHandler {
  return { handle: () => of(value) };
}

function makeErrorHandler(err: unknown): CallHandler {
  return { handle: () => throwError(() => err) };
}

describe("MetricsInterceptor", () => {
  let metrics: ForgeMetrics;
  let interceptor: MetricsInterceptor;

  beforeEach(() => {
    metrics = new ForgeMetrics({ defaultMetrics: false });
    interceptor = new (MetricsInterceptor as new (m: ForgeMetrics) => MetricsInterceptor)(metrics);
  });

  it("정상 응답 시 http_requests_total을 inc한다", async () => {
    const ctx = makeContext({ method: "GET", routePath: "/users/:id", statusCode: 200 });
    await lastValueFrom(interceptor.intercept(ctx, makeHandler("ok")));

    const text = await metrics.metrics();
    expect(text).toContain("http_requests_total");
    expect(text).toContain('method="GET"');
    expect(text).toContain('route="/users/:id"');
    expect(text).toContain('status="200"');
  });

  it("정상 응답 시 http_request_duration_seconds를 observe한다", async () => {
    const ctx = makeContext({ method: "POST", routePath: "/orders", statusCode: 201 });
    await lastValueFrom(interceptor.intercept(ctx, makeHandler({ id: 1 })));

    const text = await metrics.metrics();
    expect(text).toContain("http_request_duration_seconds");
    expect(text).toContain('method="POST"');
    expect(text).toContain('route="/orders"');
  });

  it("예외 발생 시 에러 status로 기록하고 에러를 재-throw한다", async () => {
    const ctx = makeContext({ method: "GET", routePath: "/users/:id" });
    const err = Object.assign(new Error("Not Found"), { status: 404 });

    await expect(lastValueFrom(interceptor.intercept(ctx, makeErrorHandler(err)))).rejects.toThrow(
      "Not Found",
    );

    const text = await metrics.metrics();
    expect(text).toContain('status="404"');
  });

  it("status 없는 예외는 status 500으로 기록한다", async () => {
    const ctx = makeContext({ method: "GET", routePath: "/items" });
    const err = new Error("Unexpected");

    await expect(lastValueFrom(interceptor.intercept(ctx, makeErrorHandler(err)))).rejects.toThrow(
      "Unexpected",
    );

    const text = await metrics.metrics();
    expect(text).toContain('status="500"');
  });

  it("route 패턴이 없으면 url을 사용한다", async () => {
    const ctx = makeContext({ method: "GET", url: "/fallback-url", statusCode: 200 });
    await lastValueFrom(interceptor.intercept(ctx, makeHandler("ok")));

    const text = await metrics.metrics();
    expect(text).toContain('route="/fallback-url"');
  });
});
