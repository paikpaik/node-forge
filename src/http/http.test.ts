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
