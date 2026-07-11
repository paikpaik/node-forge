import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { checkHealth } from "../health";
import type { HealthChecker } from "../health";

export interface HealthPluginOptions {
  checkers: Record<string, HealthChecker>;
}

/**
 * @description `GET /health` 라우트를 등록하는 플러그인 (NestJS의 `HealthController`와 동일한 역할).
 * `options.checkers`를 실행해 `HealthReport`를 만들고, 하나라도 비정상이면 `503`으로 응답해
 * 로드밸런서/오케스트레이터가 비정상 인스턴스를 트래픽에서 제외할 수 있도록 한다.
 */
const healthPlugin: FastifyPluginAsync<HealthPluginOptions> = async (fastify, options) => {
  fastify.get("/health", async (_request, reply) => {
    const report = await checkHealth(options.checkers);

    if (report.status === "error") {
      reply.code(503);
    }

    return report;
  });
};

/**
 * @description `healthPlugin`을 `fastify-plugin`으로 감싸 캡슐화를 해제한 플러그인.
 * `fastify.register(fastifyHealth, { checkers })`로 등록하면 `/health`를 즉시 사용할 수 있다.
 */
export const fastifyHealth = fp(healthPlugin, {
  name: "@paikpaik/node-forge/health",
});
