import { describe, it, expect } from 'vitest'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { fastifyVersioning } from './versioning.plugin'

function getGetter() {
  let captured: { getter: (this: FastifyRequest) => unknown } | undefined
  const fastify = {
    decorateRequest: (_name: string, descriptor: { getter: (this: FastifyRequest) => unknown }) => {
      captured = descriptor
    },
  } as unknown as FastifyInstance

  // fp() 래핑된 플러그인의 내부 함수를 직접 호출해 decorateRequest 등록을 트리거한다
  const plugin = fastifyVersioning as unknown as (fastify: FastifyInstance) => Promise<void>
  return plugin(fastify).then(() => {
    if (!captured) throw new Error('decorateRequest가 호출되지 않았습니다')
    return captured.getter
  })
}

function mockRequest(headers: Record<string, unknown>): FastifyRequest {
  return { headers } as unknown as FastifyRequest
}

describe('fastifyVersioning', () => {
  it('request.getApiVersion으로 Accept-Version 헤더를 협상한다', async () => {
    const getter = await getGetter()
    const request = mockRequest({ 'accept-version': 'v1' })
    const getApiVersion = getter.call(request) as (options: unknown) => unknown
    expect(getApiVersion({ defaultVersion: 'v2', supportedVersions: ['v1', 'v2'] })).toEqual({
      requested: 'v1',
      resolved: 'v1',
      isFallback: false,
    })
  })

  it('헤더가 없으면 defaultVersion으로 폴백한다', async () => {
    const getter = await getGetter()
    const request = mockRequest({})
    const getApiVersion = getter.call(request) as (options: unknown) => unknown
    expect(getApiVersion({ defaultVersion: 'v2' })).toEqual({
      requested: null,
      resolved: 'v2',
      isFallback: true,
    })
  })

  it('options.headerName으로 다른 헤더명을 지정할 수 있다', async () => {
    const getter = await getGetter()
    const request = mockRequest({ 'x-api-version': 'v1' })
    const getApiVersion = getter.call(request) as (options: unknown) => unknown
    expect(
      getApiVersion({ defaultVersion: 'v2', supportedVersions: ['v1', 'v2'], headerName: 'x-api-version' }),
    ).toEqual({ requested: 'v1', resolved: 'v1', isFallback: false })
  })
})
