import { describe, it, expect, vi } from "vitest";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { fastifyHealth } from "./health.plugin";

type Handler = (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

function getHandler(checkers: Record<string, () => Promise<void>>, cacheMs?: number) {
  let captured: Handler | undefined;
  const fastify = {
    get: (_path: string, handler: Handler) => {
      captured = handler;
    },
  } as unknown as FastifyInstance;

  const plugin = fastifyHealth as unknown as (
    fastify: FastifyInstance,
    options: { checkers: Record<string, () => Promise<void>>; cacheMs?: number },
  ) => Promise<void>;

  return plugin(fastify, { checkers, cacheMs }).then(() => {
    if (!captured) throw new Error("GET /health 라우트가 등록되지 않았습니다");
    return captured;
  });
}

function mockReply(): FastifyReply {
  return { code: vi.fn() } as unknown as FastifyReply;
}

describe("fastifyHealth", () => {
  it("모든 체커가 정상이면 200 상태로 HealthReport를 반환한다", async () => {
    const handler = await getHandler({ db: vi.fn().mockResolvedValue(undefined) });
    const reply = mockReply();

    const result = await handler({} as FastifyRequest, reply);

    expect(result).toEqual({ status: "ok", checks: [{ name: "db", status: "up" }] });
    expect(reply.code).not.toHaveBeenCalled();
  });

  it("하나라도 비정상이면 503으로 응답한다", async () => {
    const handler = await getHandler({ db: vi.fn().mockRejectedValue(new Error("연결 실패")) });
    const reply = mockReply();

    const result = await handler({} as FastifyRequest, reply);

    expect(result).toEqual({
      status: "error",
      checks: [{ name: "db", status: "down", error: "연결 실패" }],
    });
    expect(reply.code).toHaveBeenCalledWith(503);
  });

  it("cacheMs를 지정하면 짧은 시간 안의 반복 요청에서 체커를 다시 실행하지 않는다", async () => {
    const checker = vi.fn().mockResolvedValue(undefined);
    const handler = await getHandler({ db: checker }, 5_000);
    const reply = mockReply();

    await handler({} as FastifyRequest, reply);
    await handler({} as FastifyRequest, reply);

    expect(checker).toHaveBeenCalledTimes(1);
  });
});
