import type { ForgeLogger } from '../logger'
import type { ForgeMetrics } from '../metrics'

export interface HttpOptions {
  baseURL?: string
  timeout?: number
  retries?: number
  retryDelay?: number
  headers?: Record<string, string>
  logger?: ForgeLogger
  metrics?: ForgeMetrics
}
