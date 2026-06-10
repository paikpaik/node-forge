import axios from 'axios'
import type { AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios'
import type { HttpOptions } from './http.options'
import type { ForgeLogger } from '../logger'
import type { ForgeMetrics } from '../metrics'

function parseHost(url?: string): string {
  if (!url) return 'unknown'
  try {
    return new URL(url).host
  } catch {
    return 'unknown'
  }
}

/**
 * @description `axios`를 감싼 HTTP 클라이언트. `options.retries`를 주면 응답 인터셉터로
 * 지수적이지 않은 고정 지연 재시도를, `options.logger`를 주면 요청/응답/에러를 `ForgeLogger`로
 * 자동 로깅하는 인터셉터를 등록한다. 모든 verb 메서드(`get`/`post`/...)는 axios의 전체
 * `AxiosResponse`가 아니라 `response.data`만 반환해 호출부 코드를 단순하게 만든다.
 */
export class ForgeHttpClient {
  private readonly client: AxiosInstance

  constructor(options: HttpOptions = {}) {
    this.client = axios.create({
      baseURL: options.baseURL,
      timeout: options.timeout ?? 10_000,
      headers: options.headers,
    })

    const retries = options.retries ?? 0
    if (retries > 0) {
      this.setupRetry(retries, options.retryDelay ?? 300)
    }

    if (options.logger) {
      this.setupLogging(options.logger)
    }

    if (options.metrics) {
      this.setupMetrics(options.metrics)
    }
  }

  private setupRetry(retries: number, retryDelay: number): void {
    this.client.interceptors.response.use(undefined, async (error) => {
      const config = error.config as InternalAxiosRequestConfig & { _retryCount?: number }
      if (!config) return Promise.reject(error)

      config._retryCount = (config._retryCount ?? 0) + 1
      if (config._retryCount <= retries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay * config._retryCount!))
        return this.client.request(config)
      }

      return Promise.reject(error)
    })
  }

  private setupMetrics(metrics: ForgeMetrics): void {
    const requestsTotal = metrics.counter({
      name: 'http_outbound_requests_total',
      help: 'Total number of outbound HTTP requests',
      labelNames: ['method', 'host', 'status'],
    })
    const requestDuration = metrics.histogram({
      name: 'http_outbound_request_duration_seconds',
      help: 'Outbound HTTP request duration in seconds',
      labelNames: ['method', 'host', 'status'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    })

    this.client.interceptors.request.use((config) => {
      (config as InternalAxiosRequestConfig & { _metricsStart?: number })._metricsStart = Date.now()
      return config
    })

    this.client.interceptors.response.use(
      (response) => {
        const cfg = response.config as InternalAxiosRequestConfig & { _metricsStart?: number }
        const duration = cfg._metricsStart ? (Date.now() - cfg._metricsStart) / 1000 : 0
        const labels = {
          method: cfg.method?.toUpperCase() ?? 'UNKNOWN',
          host: parseHost(cfg.baseURL ?? cfg.url),
          status: String(response.status),
        }
        requestsTotal.labels(labels).inc()
        requestDuration.labels(labels).observe(duration)
        return response
      },
      (error) => {
        const cfg = (error.config ?? {}) as InternalAxiosRequestConfig & { _metricsStart?: number }
        const duration = cfg._metricsStart ? (Date.now() - cfg._metricsStart) / 1000 : 0
        const labels = {
          method: cfg.method?.toUpperCase() ?? 'UNKNOWN',
          host: parseHost(cfg.baseURL ?? cfg.url),
          status: String((error.response as { status?: number } | undefined)?.status ?? 0),
        }
        requestsTotal.labels(labels).inc()
        requestDuration.labels(labels).observe(duration)
        return Promise.reject(error)
      },
    )
  }

  private setupLogging(logger: ForgeLogger): void {
    this.client.interceptors.request.use((config) => {
      logger.info('HTTP 요청', { method: config.method?.toUpperCase(), url: config.url })
      return config
    })

    this.client.interceptors.response.use(
      (response) => {
        logger.info('HTTP 응답', { status: response.status, url: response.config.url })
        return response
      },
      (error) => {
        logger.error('HTTP 오류', error, { url: error.config?.url, status: error.response?.status })
        return Promise.reject(error)
      },
    )
  }

  /**
   * @description GET 요청을 보내고 `response.data`를 바로 반환한다 (제네릭 `T`로 응답 바디 타입 지정).
   * 나머지 verb 메서드(`post`/`put`/`patch`/`delete`)도 동일한 규칙으로 동작한다.
   */
  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(url, config)
    return response.data
  }

  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post<T>(url, data, config)
    return response.data
  }

  async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.put<T>(url, data, config)
    return response.data
  }

  async patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.patch<T>(url, data, config)
    return response.data
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(url, config)
    return response.data
  }

  /**
   * @description 내부에서 사용하는 원본 `AxiosInstance`에 직접 접근한다. `ForgeHttpClient`가
   * 제공하지 않는 axios 고유 기능(인터셉터 추가, 파일 업로드 설정 등)이 필요할 때 사용한다.
   */
  getClient(): AxiosInstance {
    return this.client
  }
}

/**
 * @description `ForgeHttpClient`의 함수형 래퍼. `new` 없이 옵션으로 클라이언트를 생성하고
 * 싶을 때 사용한다 (동작은 `new ForgeHttpClient(options)`와 동일).
 */
export function createHttpClient(options?: HttpOptions): ForgeHttpClient {
  return new ForgeHttpClient(options)
}
