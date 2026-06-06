import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { ForgeMetrics } from '../metrics'
import type { MetricsOptions } from '../metrics'

declare module 'fastify' {
  interface FastifyInstance {
    metrics: ForgeMetrics
  }
}

const metricsPlugin: FastifyPluginAsync<MetricsOptions> = async (fastify, options) => {
  const metrics = new ForgeMetrics(options)

  fastify.decorate('metrics', metrics)

  fastify.get('/metrics', async (_, reply) => {
    reply.header('Content-Type', metrics.contentType)
    return metrics.metrics()
  })
}

export const fastifyMetrics = fp(metricsPlugin, {
  name: '@paikpaik/node-forge/metrics',
})
