import axios from 'axios'
import type { AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios'
import type { HttpOptions } from './http.options'
import type { ForgeLogger } from '../logger'

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

  getClient(): AxiosInstance {
    return this.client
  }
}

export function createHttpClient(options?: HttpOptions): ForgeHttpClient {
  return new ForgeHttpClient(options)
}
