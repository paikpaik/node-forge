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

/**
 * @description `ForgeLogger`를 Fastify에 통합하는 플러그인. `fastify.forgeLogger`로 앱 전역
 * 로거에 접근할 수 있고, `onRequest` 훅에서 매 요청마다 `traceId`/`requestId`/`ip`가
 * 포함된 자식 로거를 만들어 `request.forgeLogger`에 주입한다 — 따라서 핸들러에서는
 * 컨텍스트를 직접 넘기지 않아도 요청별로 로그가 자동 추적된다 (헤더에 trace/request id가
 * 있으면 재사용하고, 없으면 새로 생성한다).
 */
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

/**
 * @description `loggerPlugin`을 `fastify-plugin`으로 감싸 캡슐화를 해제한 플러그인.
 * `fastify.register(fastifyLogger, options)`로 등록하면 `fastify.forgeLogger`와
 * `request.forgeLogger`를 즉시 사용할 수 있다.
 */
export const fastifyLogger = fp(loggerPlugin, {
  name: '@paikpaik/node-forge/logger',
})
