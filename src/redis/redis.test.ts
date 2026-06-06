import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ForgeRedisClient, createRedisClient } from './redis'

vi.mock('ioredis', () => {
  const MockRedis = vi.fn().mockImplementation(() => ({
    ping: vi.fn().mockResolvedValue('PONG'),
    disconnect: vi.fn(),
    quit: vi.fn().mockResolvedValue('OK'),
  }))
  return { default: MockRedis }
})

describe('ForgeRedisClient', () => {
  beforeEach(() => vi.clearAllMocks())

  it('createRedisClient로 인스턴스를 생성한다', () => {
    const client = createRedisClient()
    expect(client).toBeInstanceOf(ForgeRedisClient)
  })

  it('ping()이 PONG 응답 시 true를 반환한다', async () => {
    const client = createRedisClient()
    expect(await client.ping()).toBe(true)
  })

  it('ping() 실패 시 false를 반환한다', async () => {
    const { default: MockRedis } = await import('ioredis')
    vi.mocked(MockRedis).mockImplementationOnce(() => ({
      ping: vi.fn().mockRejectedValue(new Error('connection refused')),
      disconnect: vi.fn(),
    }) as never)

    const client = createRedisClient()
    expect(await client.ping()).toBe(false)
  })

  it('getClient()로 ioredis 인스턴스를 반환한다', () => {
    const client = createRedisClient()
    expect(client.getClient()).toBeDefined()
  })

  it('disconnect()를 호출한다', async () => {
    const client = createRedisClient()
    const raw = client.getClient()
    await client.disconnect()
    expect(raw.disconnect).toHaveBeenCalled()
  })

  it('옵션이 전달되면 Redis 생성자에 적용된다', async () => {
    const { default: MockRedis } = await import('ioredis')
    createRedisClient({ host: 'redis.internal', port: 6380, password: 'secret', db: 1 })
    expect(MockRedis).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'redis.internal', port: 6380, db: 1 }),
    )
  })
})
