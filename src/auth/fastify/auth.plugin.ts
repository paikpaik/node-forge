import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { verifyToken } from "../auth";
import type { SignTokenOptions } from "../auth.options";

export interface AuthedUser {
  role?: string;
  [key: string]: unknown;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthedUser;
  }
  interface FastifyInstance {
    auth: {
      authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
      authorize(
        ...roles: string[]
      ): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    };
  }
}

function extractBearerToken(header?: string): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  return scheme === "Bearer" && token ? token : null;
}

const authPlugin: FastifyPluginAsync<SignTokenOptions> = async (fastify, options) => {
  const authenticate = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const token = extractBearerToken(request.headers.authorization);
    const claims = token ? verifyToken<AuthedUser>(token, options.secret) : null;

    if (!claims) {
      reply.code(401).send({ message: "Unauthorized" });
      return;
    }

    request.user = claims;
  };

  const authorize = (...roles: string[]) => {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const role = request.user?.role;
      if (!role || !roles.includes(role)) {
        reply.code(403).send({ message: "Forbidden" });
      }
    };
  };

  fastify.decorate("auth", { authenticate, authorize });
};

/**
 * @description `fastify.auth.authenticate`/`fastify.auth.authorize(...roles)` preHandler를
 * 등록하는 플러그인. `fastify.register(fastifyAuth, { secret, expiresIn })`로 등록한 뒤,
 * 라우트의 `preHandler`에 `[fastify.auth.authenticate, fastify.auth.authorize("admin")]`처럼
 * 붙여 사용한다. `authenticate`는 검증 실패 시 401을, `authorize`는 role 불일치 시 403을 보낸다.
 */
export const fastifyAuth = fp(authPlugin, {
  name: "@paikpaik/node-forge/auth",
});
