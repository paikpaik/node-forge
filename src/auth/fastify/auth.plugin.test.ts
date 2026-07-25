import { describe, it, expect, vi } from "vitest";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { fastifyAuth } from "./auth.plugin";
import { signToken } from "../auth";

type AuthApi = {
  authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  authorize: (
    ...roles: string[]
  ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
};

const OPTIONS = { secret: "s3cr3t", expiresIn: "15m" };

async function getAuthApi(): Promise<AuthApi> {
  let captured: AuthApi | undefined;
  const fastify = {
    decorate: (_name: string, value: AuthApi) => {
      captured = value;
    },
  } as unknown as FastifyInstance;

  const plugin = fastifyAuth as unknown as (
    fastify: FastifyInstance,
    options: typeof OPTIONS,
  ) => Promise<void>;

  await plugin(fastify, OPTIONS);
  if (!captured) throw new Error("auth 데코레이터가 등록되지 않았습니다");
  return captured;
}

function mockReply(): FastifyReply {
  return { code: vi.fn().mockReturnThis(), send: vi.fn() } as unknown as FastifyReply;
}

describe("fastifyAuth", () => {
  describe("authenticate", () => {
    it("유효한 Bearer 토큰이면 request.user를 채운다", async () => {
      const { authenticate } = await getAuthApi();
      const token = signToken({ sub: "user-1", role: "customer" }, OPTIONS);
      const request = {
        headers: { authorization: `Bearer ${token}` },
      } as unknown as FastifyRequest;
      const reply = mockReply();

      await authenticate(request, reply);

      expect(request.user).toEqual(expect.objectContaining({ sub: "user-1", role: "customer" }));
      expect(reply.code).not.toHaveBeenCalled();
    });

    it("토큰이 없으면 401로 응답하고 request.user를 채우지 않는다", async () => {
      const { authenticate } = await getAuthApi();
      const request = { headers: {} } as unknown as FastifyRequest;
      const reply = mockReply();

      await authenticate(request, reply);

      expect(reply.code).toHaveBeenCalledWith(401);
      expect(request.user).toBeUndefined();
    });

    it("검증에 실패한 토큰이면 401로 응답한다", async () => {
      const { authenticate } = await getAuthApi();
      const token = signToken({ sub: "user-1" }, { secret: "other-secret", expiresIn: "15m" });
      const request = {
        headers: { authorization: `Bearer ${token}` },
      } as unknown as FastifyRequest;
      const reply = mockReply();

      await authenticate(request, reply);

      expect(reply.code).toHaveBeenCalledWith(401);
    });
  });

  describe("authorize", () => {
    it("user.role이 허용 목록에 있으면 통과시킨다", async () => {
      const { authorize } = await getAuthApi();
      const request = { headers: {}, user: { role: "admin" } } as unknown as FastifyRequest;
      const reply = mockReply();

      await authorize("admin")(request, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });

    it("user.role이 허용 목록에 없으면 403으로 응답한다", async () => {
      const { authorize } = await getAuthApi();
      const request = { headers: {}, user: { role: "customer" } } as unknown as FastifyRequest;
      const reply = mockReply();

      await authorize("admin")(request, reply);

      expect(reply.code).toHaveBeenCalledWith(403);
    });
  });
});
