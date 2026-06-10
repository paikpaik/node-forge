import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ForgeHttpClient, createHttpClient } from './http'

vi.mock('axios', () => {
  const mockInstance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
    request: vi.fn(),
  }
  return {
    default: {
      create: vi.fn().mockReturnValue(mockInstance),
    },
  }
})

describe('ForgeHttpClient', () => {
  beforeEach(() => vi.clearAllMocks())

  it('createHttpClient로 인스턴스를 생성한다', () => {
    const client = createHttpClient()
    expect(client).toBeInstanceOf(ForgeHttpClient)
  })

  it('baseURL과 timeout 옵션을 axios.create에 전달한다', async () => {
    const { default: axios } = await import('axios')
    createHttpClient({ baseURL: 'https://api.example.com', timeout: 5_000 })
    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'https://api.example.com', timeout: 5_000 }),
    )
  })

  it('get()이 response.data를 반환한다', async () => {
    const { default: axios } = await import('axios')
    const mockInstance = vi.mocked(axios.create)()
    vi.mocked(mockInstance.get).mockResolvedValueOnce({ data: { id: 1 } })

    const client = createHttpClient()
    const result = await client.get('/users/1')
    expect(result).toEqual({ id: 1 })
  })

  it('post()가 response.data를 반환한다', async () => {
    const { default: axios } = await import('axios')
    const mockInstance = vi.mocked(axios.create)()
    vi.mocked(mockInstance.post).mockResolvedValueOnce({ data: { id: 2, name: 'foo' } })

    const client = createHttpClient()
    const result = await client.post('/users', { name: 'foo' })
    expect(result).toEqual({ id: 2, name: 'foo' })
  })

  it('getClient()로 axios 인스턴스를 반환한다', () => {
    const client = createHttpClient()
    expect(client.getClient()).toBeDefined()
  })

  it('retries > 0이면 response interceptor를 등록한다', async () => {
    const { default: axios } = await import('axios')
    const mockInstance = vi.mocked(axios.create)()
    createHttpClient({ retries: 3 })
    expect(mockInstance.interceptors.response.use).toHaveBeenCalled()
  })

  it('logger가 주어지면 request/response interceptor를 등록한다', async () => {
    const { default: axios } = await import('axios')
    const mockInstance = vi.mocked(axios.create)()
    const mockLogger = { info: vi.fn(), error: vi.fn() } as never
    createHttpClient({ logger: mockLogger })
    expect(mockInstance.interceptors.request.use).toHaveBeenCalled()
    expect(mockInstance.interceptors.response.use).toHaveBeenCalled()
  })
})

describe('ForgeHttpClient — metrics', () => {
  beforeEach(() => vi.clearAllMocks())

  function buildMetricsMock() {
    const inc = vi.fn()
    const observe = vi.fn()
    const counterLabels = vi.fn().mockReturnValue({ inc })
    const histogramLabels = vi.fn().mockReturnValue({ observe })
    const counter = vi.fn().mockReturnValue({ labels: counterLabels })
    const histogram = vi.fn().mockReturnValue({ labels: histogramLabels })
    return {
      mockMetrics: { counter, histogram } as never,
      inc,
      observe,
      counterLabels,
      histogramLabels,
    }
  }

  it('metrics 옵션이 있으면 request + response interceptors를 등록한다', async () => {
    const { default: axios } = await import('axios')
    const mockInstance = vi.mocked(axios.create)()
    const { mockMetrics } = buildMetricsMock()
    createHttpClient({ metrics: mockMetrics })
    expect(mockInstance.interceptors.request.use).toHaveBeenCalled()
    expect(mockInstance.interceptors.response.use).toHaveBeenCalled()
  })

  it('metrics 없이 생성하면 request interceptor를 등록하지 않는다', async () => {
    const { default: axios } = await import('axios')
    const mockInstance = vi.mocked(axios.create)()
    createHttpClient()
    expect(mockInstance.interceptors.request.use).not.toHaveBeenCalled()
  })

  it('성공 응답 시 method/host/status 레이블로 counter와 histogram을 기록한다', async () => {
    const { default: axios } = await import('axios')
    const mockInstance = vi.mocked(axios.create)()
    const { mockMetrics, inc, observe, counterLabels, histogramLabels } = buildMetricsMock()
    createHttpClient({ baseURL: 'https://api.example.com', metrics: mockMetrics })

    const [[successHandler]] = vi.mocked(mockInstance.interceptors.response.use).mock.calls as [[(res: unknown) => unknown, (err: unknown) => Promise<unknown>]]
    const fakeResponse = {
      status: 200,
      config: { method: 'get', baseURL: 'https://api.example.com', _metricsStart: Date.now() - 100 },
    }
    successHandler(fakeResponse)

    const expectedLabels = { method: 'GET', host: 'api.example.com', status: '200' }
    expect(counterLabels).toHaveBeenCalledWith(expectedLabels)
    expect(inc).toHaveBeenCalled()
    expect(histogramLabels).toHaveBeenCalledWith(expectedLabels)
    expect(observe).toHaveBeenCalled()
  })

  it('HTTP 에러 응답 시 실제 status 코드로 메트릭을 기록하고 에러를 re-reject한다', async () => {
    const { default: axios } = await import('axios')
    const mockInstance = vi.mocked(axios.create)()
    const { mockMetrics, inc, counterLabels } = buildMetricsMock()
    createHttpClient({ metrics: mockMetrics })

    const [[, errorHandler]] = vi.mocked(mockInstance.interceptors.response.use).mock.calls as [[(res: unknown) => unknown, (err: unknown) => Promise<unknown>]]
    const fakeError = {
      config: { method: 'post', baseURL: 'https://api.example.com', _metricsStart: Date.now() - 50 },
      response: { status: 404 },
    }

    await expect(errorHandler(fakeError)).rejects.toEqual(fakeError)
    expect(counterLabels).toHaveBeenCalledWith(expect.objectContaining({ status: '404' }))
    expect(inc).toHaveBeenCalled()
  })

  it('네트워크 에러(응답 없음) 시 status "0"으로 메트릭을 기록한다', async () => {
    const { default: axios } = await import('axios')
    const mockInstance = vi.mocked(axios.create)()
    const { mockMetrics, counterLabels } = buildMetricsMock()
    createHttpClient({ metrics: mockMetrics })

    const [[, errorHandler]] = vi.mocked(mockInstance.interceptors.response.use).mock.calls as [[(res: unknown) => unknown, (err: unknown) => Promise<unknown>]]
    const networkError = { config: { method: 'get' }, response: undefined }

    await expect(errorHandler(networkError)).rejects.toEqual(networkError)
    expect(counterLabels).toHaveBeenCalledWith(expect.objectContaining({ status: '0' }))
  })
})
