import type { ForgeLogger } from '../logger'

export interface HttpOptions {
  baseURL?: string
  timeout?: number
  retries?: number
  retryDelay?: number
  headers?: Record<string, string>
  logger?: ForgeLogger
}
