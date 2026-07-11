import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { ForgeMetrics } from "../metrics";
import type { MetricsOptions } from "../metrics";

const HTTP_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

/**
 * @description `metricsPlugin`의 옵션. `MetricsOptions`를 상속하며, `httpMetrics: true`를
 * 지정하면 인바운드 HTTP 요청의 처리 시간과 상태 코드를 자동으로 기록하는 `onRequest`/`onResponse`
 * 훅을 추가로 등록한다. 기본값은 `false`(opt-in)라 기존 등록 코드를 변경하지 않아도 된다.
 */
export interface FastifyMetricsOptions extends MetricsOptions {
  httpMetrics?: boolean;
}

declare module "fastify" {
  interface FastifyInstance {
    metrics: ForgeMetrics;
  }
  interface FastifyRequest {
    startTime: number;
  }
}

/**
 * @description `ForgeMetrics`를 생성해 `fastify.metrics`로 데코레이트하고, Prometheus가
 * 스크래핑할 `GET /metrics` 라우트를 자동으로 등록한다 (NestJS의 `MetricsController`와 동일한 역할).
 * `httpMetrics: true` 옵션을 주면 `http_requests_total`과 `http_request_duration_seconds`
 * 지표를 자동으로 수집한다 — `route` 라벨은 등록된 경로 패턴을 사용해 카디널리티 폭발을 방지한다.
 */
const metricsPlugin: FastifyPluginAsync<FastifyMetricsOptions> = async (fastify, options) => {
  const metrics = new ForgeMetrics(options);

  fastify.decorate("metrics", metrics);

  fastify.get("/metrics", async (_, reply) => {
    reply.header("Content-Type", metrics.contentType);
    return metrics.metrics();
  });

  if (options.httpMetrics) {
    const requestsTotal = metrics.counter({
      name: "http_requests_total",
      help: "인바운드 HTTP 요청 수",
      labelNames: ["method", "route", "status"],
    });
    const requestDuration = metrics.histogram({
      name: "http_request_duration_seconds",
      help: "인바운드 HTTP 요청 처리 시간 (초)",
      labelNames: ["method", "route", "status"],
      buckets: HTTP_BUCKETS,
    });

    fastify.decorateRequest("startTime", 0);

    fastify.addHook("onRequest", (request, _reply, done) => {
      request.startTime = Date.now();
      done();
    });

    fastify.addHook("onResponse", (request, reply, done) => {
      const duration = (Date.now() - request.startTime) / 1000;
      const route = request.routeOptions.url ?? "unknown";
      const labels = { method: request.method, route, status: String(reply.statusCode) };
      requestsTotal.labels(labels).inc();
      requestDuration.labels(labels).observe(duration);
      done();
    });
  }
};

/**
 * @description `metricsPlugin`을 `fastify-plugin`으로 감싸 캡슐화를 해제한 플러그인.
 * `fastify.register(fastifyMetrics, options)`로 등록하면 `fastify.metrics`와
 * `/metrics` 엔드포인트를 즉시 사용할 수 있다.
 */
export const fastifyMetrics = fp(metricsPlugin, {
  name: "@paikpaik/node-forge/metrics",
});
