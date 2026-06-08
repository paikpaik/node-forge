import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { ForgeMetrics } from '../metrics'
import type { MetricsOptions } from '../metrics'

declare module 'fastify' {
  interface FastifyInstance {
    metrics: ForgeMetrics
  }
}

/**
 * @description `ForgeMetrics`를 생성해 `fastify.metrics`로 데코레이트하고, Prometheus가
 * 스크래핑할 `GET /metrics` 라우트를 자동으로 등록한다 (NestJS의 `MetricsController`와 동일한 역할).
 */
const metricsPlugin: FastifyPluginAsync<MetricsOptions> = async (fastify, options) => {
  const metrics = new ForgeMetrics(options)

  fastify.decorate('metrics', metrics)

  fastify.get('/metrics', async (_, reply) => {
    reply.header('Content-Type', metrics.contentType)
    return metrics.metrics()
  })
}

/**
 * @description `metricsPlugin`을 `fastify-plugin`으로 감싸 캡슐화를 해제한 플러그인.
 * `fastify.register(fastifyMetrics, options)`로 등록하면 `fastify.metrics`와
 * `/metrics` 엔드포인트를 즉시 사용할 수 있다.
 */
export const fastifyMetrics = fp(metricsPlugin, {
  name: '@paikpaik/node-forge/metrics',
})
