export interface RedisOptions {
  host?: string
  port?: number
  password?: string
  db?: number
  keyPrefix?: string
  tls?: boolean
  connectTimeout?: number
  maxRetriesPerRequest?: number
}
