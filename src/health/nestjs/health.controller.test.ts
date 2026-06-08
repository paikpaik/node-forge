import { describe, it, expect, vi } from 'vitest'
import { HttpException } from '@nestjs/common'
import { HealthController } from './health.controller'

describe('HealthController', () => {
  it('모든 체커가 정상이면 HealthReport를 그대로 반환한다', async () => {
    const controller = new HealthController({ db: vi.fn().mockResolvedValue(undefined) })

    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      checks: [{ name: 'db', status: 'up' }],
    })
  })

  it('하나라도 비정상이면 503 HttpException을 던진다', async () => {
    const controller = new HealthController({
      db: vi.fn().mockRejectedValue(new Error('연결 실패')),
    })

    await expect(controller.check()).rejects.toThrow(HttpException)

    try {
      await controller.check()
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException)
      expect((error as HttpException).getStatus()).toBe(503)
      expect((error as HttpException).getResponse()).toEqual({
        status: 'error',
        checks: [{ name: 'db', status: 'down', error: '연결 실패' }],
      })
    }
  })
})
