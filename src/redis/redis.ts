import Redis from 'ioredis'
import type { RedisOptions } from './redis.options'

export class ForgeRedisClient {
  private readonly client: Redis

  constructor(options: RedisOptions = {}) {
    this.client = new Redis({
      host: options.host ?? 'localhost',
      port: options.port ?? 6379,
      password: options.password,
      db: options.db ?? 0,
      keyPrefix: options.keyPrefix,
      connectTimeout: options.connectTimeout ?? 10_000,
      maxRetriesPerRequest: options.maxRetriesPerRequest ?? 3,
      retryStrategy: (times) => Math.min(times * 50, 2_000),
      lazyConnect: true,
      ...(options.tls && { tls: {} }),
    })
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping()
      return result === 'PONG'
    } catch {
      return false
    }
  }

  getClient(): Redis {
    return this.client
  }

  async disconnect(): Promise<void> {
    this.client.disconnect()
  }
}

export function createRedisClient(options?: RedisOptions): ForgeRedisClient {
  return new ForgeRedisClient(options)
}
