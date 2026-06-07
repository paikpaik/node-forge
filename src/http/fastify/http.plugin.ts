import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { ForgeHttpClient } from '../http'
import type { HttpOptions } from '../http.options'

declare module 'fastify' {
  interface FastifyInstance {
    http: ForgeHttpClient
  }
}

/**
 * @description `ForgeHttpClient`를 생성해 `fastify.http`로 데코레이트한다. 앱 전체에서
 * 단일 인스턴스를 공유하므로(요청별 인스턴스가 아님), 외부 API 호출용 공용 클라이언트로
 * 적합하다 — 요청 컨텍스트가 필요한 로깅 등은 `options.logger`로 별도 구성한다.
 */
const httpPlugin: FastifyPluginAsync<HttpOptions> = async (fastify, options) => {
  const client = new ForgeHttpClient(options)
  fastify.decorate('http', client)
}

/**
 * @description `httpPlugin`을 `fastify-plugin`으로 감싸 캡슐화를 해제한 플러그인.
 * `fastify.register(fastifyHttp, options)`로 등록하면 `fastify.http`를 즉시 사용할 수 있다.
 */
export const fastifyHttp = fp(httpPlugin, {
  name: '@paikpaik/node-forge/http',
})
