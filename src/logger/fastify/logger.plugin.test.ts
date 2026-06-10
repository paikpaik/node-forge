import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { ForgeLogger } from '../logger'

vi.mock('../logger', () => ({
  createLogger: vi.fn(),
}))

import { createLogger } from '../logger'
import { fastifyLogger } from './logger.plugin'

type OnRequestHook = (request: FastifyRequest, reply: FastifyReply, done: () => void) => void

function buildMockLogger() {
  const capturedContexts: Record<string, unknown>[] = []
  const mockLogger = {
    withContext: vi.fn().mockImplementation((ctx: Record<string, unknown>) => {
      capturedContexts.push(ctx)
      return mockLogger
    }),
  } as unknown as ForgeLogger
  return { mockLogger, capturedContexts }
}

async function runOnRequest(
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const { mockLogger, capturedContexts } = buildMockLogger()
  vi.mocked(createLogger).mockReturnValue(mockLogger)

  let capturedHook: OnRequestHook | undefined
  const fastify = {
    decorate: vi.fn(),
    decorateRequest: vi.fn(),
    addHook: (event: string, fn: OnRequestHook) => {
      if (event === 'onRequest') capturedHook = fn
    },
  } as unknown as FastifyInstance

  const plugin = fastifyLogger as unknown as (
    fastify: FastifyInstance,
    options: Record<string, unknown>,
  ) => Promise<void>
  await plugin(fastify, {})

  if (!capturedHook) throw new Error('onRequest 훅이 등록되지 않았습니다')

  const req = { headers, ip: '127.0.0.1' } as unknown as FastifyRequest
  capturedHook(req, {} as FastifyReply, vi.fn())

  return capturedContexts[0] ?? {}
}

describe('loggerPlugin — onRequest traceId 추출', () => {
  beforeEach(() => vi.clearAllMocks())

  it('traceparent 헤더가 있으면 그 안의 traceId를 사용한다', async () => {
    const ctx = await runOnRequest({
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    })
    expect(ctx.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736')
  })

  it('traceparent가 잘못된 포맷이면 x-trace-id로 fallback한다', async () => {
    const ctx = await runOnRequest({
      traceparent: 'invalid-header',
      'x-trace-id': 'my-trace-id',
    })
    expect(ctx.traceId).toBe('my-trace-id')
  })

  it('traceparent가 없으면 x-trace-id를 사용한다', async () => {
    const ctx = await runOnRequest({ 'x-trace-id': 'fallback-trace' })
    expect(ctx.traceId).toBe('fallback-trace')
  })

  it('traceparent, x-trace-id 둘 다 없으면 UUID를 생성한다', async () => {
    const ctx = await runOnRequest({})
    expect(ctx.traceId).toMatch(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/)
  })

  it('x-request-id 헤더가 있으면 requestId로 사용한다', async () => {
    const ctx = await runOnRequest({ 'x-request-id': 'req-abc' })
    expect(ctx.requestId).toBe('req-abc')
  })

  it('x-request-id가 없으면 UUID를 생성한다', async () => {
    const ctx = await runOnRequest({})
    expect(ctx.requestId).toMatch(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/)
  })
})
