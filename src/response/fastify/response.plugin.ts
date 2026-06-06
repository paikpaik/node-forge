import fp from 'fastify-plugin'
import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import { ok, fail } from '../response'
import type { ApiResponse } from '../response'
import type { PaginationMeta } from '../../core'

declare module 'fastify' {
  interface FastifyReply {
    ok<T>(data: T): FastifyReply
    fail(code: string, message: string): FastifyReply
    paginated<T>(data: T[], meta: PaginationMeta): FastifyReply
  }
}

const responsePlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateReply('ok', function <T>(this: FastifyReply, data: T): FastifyReply {
    return this.send(ok(data))
  })

  fastify.decorateReply(
    'fail',
    function (this: FastifyReply, code: string, message: string): FastifyReply {
      return this.send(fail(code, message))
    },
  )

  fastify.decorateReply(
    'paginated',
    function <T>(this: FastifyReply, data: T[], meta: PaginationMeta): FastifyReply {
      return this.send({ success: true, data, meta } as ApiResponse<T[]>)
    },
  )
}

export const fastifyResponse = fp(responsePlugin, {
  name: '@paikpaik/node-forge/response',
})
