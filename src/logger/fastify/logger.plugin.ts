import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { createLogger } from '../logger'
import type { ForgeLogger } from '../logger'
import type { LoggerOptions } from '../logger.options'

declare module 'fastify' {
  interface FastifyInstance {
    forgeLogger: ForgeLogger
  }
  interface FastifyRequest {
    forgeLogger: ForgeLogger
  }
}

const loggerPlugin: FastifyPluginAsync<LoggerOptions> = async (fastify, options) => {
  const logger = createLogger(options)

  fastify.decorate('forgeLogger', logger)
  fastify.decorateRequest('forgeLogger', { getter: () => logger })

  fastify.addHook('onRequest', (request, _reply, done) => {
    const traceId = (request.headers['x-trace-id'] as string) ?? crypto.randomUUID()
    const requestId = (request.headers['x-request-id'] as string) ?? crypto.randomUUID()
    request.forgeLogger = logger.withContext({ traceId, requestId, ip: request.ip })
    done()
  })
}

export const fastifyLogger = fp(loggerPlugin, {
  name: '@paikpaik/node-forge/logger',
})
