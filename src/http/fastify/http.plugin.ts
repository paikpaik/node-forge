import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { ForgeHttpClient } from '../http'
import type { HttpOptions } from '../http.options'

declare module 'fastify' {
  interface FastifyInstance {
    http: ForgeHttpClient
  }
}

const httpPlugin: FastifyPluginAsync<HttpOptions> = async (fastify, options) => {
  const client = new ForgeHttpClient(options)
  fastify.decorate('http', client)
}

export const fastifyHttp = fp(httpPlugin, {
  name: '@paikpaik/node-forge/http',
})
