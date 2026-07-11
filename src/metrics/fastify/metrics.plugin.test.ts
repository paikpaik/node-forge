import { describe, it, expect, vi } from "vitest";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { fastifyMetrics } from "./metrics.plugin";
import type { FastifyMetricsOptions } from "./metrics.plugin";

type HookFn = (request: FastifyRequest, reply: FastifyReply, done: () => void) => void;
type GetHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

interface PluginCapture {
  onRequestHook?: HookFn;
  onResponseHook?: HookFn;
  getHandler?: GetHandler;
  decorated?: { startTime: number };
}

function buildFastifyMock(capture: PluginCapture): FastifyInstance {
  return {
    decorate: vi.fn(),
    decorateRequest: (_key: string, initialValue: number) => {
      capture.decorated = { startTime: initialValue };
    },
    get: (_path: string, handler: GetHandler) => {
      capture.getHandler = handler;
    },
    addHook: (event: string, fn: HookFn) => {
      if (event === "onRequest") capture.onRequestHook = fn;
      if (event === "onResponse") capture.onResponseHook = fn;
    },
  } as unknown as FastifyInstance;
}

async function registerPlugin(options: FastifyMetricsOptions): Promise<PluginCapture> {
  const capture: PluginCapture = {};
  const fastify = buildFastifyMock(capture);
  const plugin = fastifyMetrics as unknown as (
    fastify: FastifyInstance,
    options: FastifyMetricsOptions,
  ) => Promise<void>;
  await plugin(fastify, options);
  return capture;
}

function mockRequest(
  overrides: { method?: string; routeOptionsUrl?: string | undefined; startTime?: number } = {},
): FastifyRequest {
  return {
    method: overrides.method ?? "GET",
    routeOptions: { url: overrides.routeOptionsUrl ?? "/items" },
    startTime: overrides.startTime ?? 0,
  } as unknown as FastifyRequest;
}

function mockReply(statusCode = 200): FastifyReply {
  return { statusCode, header: vi.fn() } as unknown as FastifyReply;
}

describe("fastifyMetrics", () => {
  it("httpMetrics 없이 등록하면 onRequest/onResponse 훅이 없다", async () => {
    const capture = await registerPlugin({ defaultMetrics: false });
    expect(capture.onRequestHook).toBeUndefined();
    expect(capture.onResponseHook).toBeUndefined();
  });

  it("httpMetrics: false이면 훅이 등록되지 않는다", async () => {
    const capture = await registerPlugin({ defaultMetrics: false, httpMetrics: false });
    expect(capture.onRequestHook).toBeUndefined();
    expect(capture.onResponseHook).toBeUndefined();
  });

  it("httpMetrics: true이면 startTime decorateRequest가 등록된다", async () => {
    const capture = await registerPlugin({ defaultMetrics: false, httpMetrics: true });
    expect(capture.decorated).toBeDefined();
    expect(capture.decorated?.startTime).toBe(0);
  });

  it("httpMetrics: true이면 onRequest 훅이 startTime을 기록한다", async () => {
    const capture = await registerPlugin({ defaultMetrics: false, httpMetrics: true });
    const req = mockRequest({ startTime: 0 });
    const done = vi.fn();
    capture.onRequestHook!(req, mockReply(), done);
    expect(req.startTime).toBeGreaterThan(0);
    expect(done).toHaveBeenCalled();
  });

  it("httpMetrics: true이면 onResponse 훅이 counter와 histogram을 기록한다", async () => {
    const capture = await registerPlugin({ defaultMetrics: false, httpMetrics: true });

    const req = mockRequest({
      method: "POST",
      routeOptionsUrl: "/orders",
      startTime: Date.now() - 50,
    });
    const reply = mockReply(201);
    const done = vi.fn();
    capture.onResponseHook!(req, reply, done);
    expect(done).toHaveBeenCalled();
  });

  it("routerPath가 없으면 route 라벨을 unknown으로 처리한다", async () => {
    const capture = await registerPlugin({ defaultMetrics: false, httpMetrics: true });

    const req = mockRequest({ method: "GET", routeOptionsUrl: undefined, startTime: Date.now() });
    const done = vi.fn();
    capture.onResponseHook!(req, mockReply(404), done);
    expect(done).toHaveBeenCalled();
  });
});
