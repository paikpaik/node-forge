import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ForgeCircuitBreaker } from './circuit-breaker'
import { ForgeError } from './errors'

const FAILURE_THRESHOLD = 3
const RESET_TIMEOUT = 30_000

function makeCircuitBreaker(overrides?: Partial<ConstructorParameters<typeof ForgeCircuitBreaker>[0]>) {
  return new ForgeCircuitBreaker({
    failureThreshold: FAILURE_THRESHOLD,
    resetTimeout: RESET_TIMEOUT,
    ...overrides,
  })
}

const fail = () => Promise.reject(new Error('service error'))
const succeed = <T = string>(value: T = 'ok' as T) => () => Promise.resolve(value)

describe('ForgeCircuitBreaker', () => {
  let cb: ForgeCircuitBreaker

  beforeEach(() => {
    cb = makeCircuitBreaker()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── 초기 상태 ────────────────────────────────────────────────────────────

  it('초기 상태는 CLOSED다', () => {
    expect(cb.getState()).toBe('CLOSED')
  })

  it('CLOSED에서 fn이 성공하면 결과를 그대로 반환한다', async () => {
    expect(await cb.execute(succeed(42))).toBe(42)
  })

  it('CLOSED에서 fn이 실패하면 에러를 그대로 전파한다', async () => {
    await expect(cb.execute(fail)).rejects.toThrow('service error')
  })

  // ── CLOSED → OPEN ────────────────────────────────────────────────────────

  it('failureThreshold회 연속 실패 시 OPEN으로 전환한다', async () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await expect(cb.execute(fail)).rejects.toThrow()
    }
    expect(cb.getState()).toBe('OPEN')
  })

  it('failureThreshold - 1회 실패는 OPEN으로 전환하지 않는다', async () => {
    for (let i = 0; i < FAILURE_THRESHOLD - 1; i++) {
      await expect(cb.execute(fail)).rejects.toThrow()
    }
    expect(cb.getState()).toBe('CLOSED')
  })

  it('CLOSED에서 성공하면 실패 카운터가 초기화된다', async () => {
    await expect(cb.execute(fail)).rejects.toThrow()
    await expect(cb.execute(fail)).rejects.toThrow()
    await cb.execute(succeed())  // 성공 → failures 초기화

    // 다시 threshold-1회 실패해도 OPEN이 아님
    await expect(cb.execute(fail)).rejects.toThrow()
    await expect(cb.execute(fail)).rejects.toThrow()
    expect(cb.getState()).toBe('CLOSED')
  })

  // ── OPEN ─────────────────────────────────────────────────────────────────

  it('OPEN 상태에서 execute 시 fn을 호출하지 않고 ForgeError(E9502)를 던진다', async () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await expect(cb.execute(fail)).rejects.toThrow()
    }

    const fn = vi.fn().mockResolvedValue('ok')
    await expect(cb.execute(fn)).rejects.toMatchObject({ code: 'E9502' })
    expect(fn).not.toHaveBeenCalled()
  })

  it('ForgeError 메시지에 name이 포함된다', async () => {
    const namedCb = makeCircuitBreaker({ name: 'payment-api' })
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await expect(namedCb.execute(fail)).rejects.toThrow()
    }
    await expect(namedCb.execute(fail)).rejects.toThrow('payment-api')
  })

  it('OPEN에서 던지는 에러는 ForgeError 인스턴스다', async () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await expect(cb.execute(fail)).rejects.toThrow()
    }
    await expect(cb.execute(fail)).rejects.toBeInstanceOf(ForgeError)
  })

  // ── OPEN → HALF_OPEN ─────────────────────────────────────────────────────

  it('OPEN에서 resetTimeout 경과 후 execute 시 HALF_OPEN으로 전환하고 fn을 실행한다', async () => {
    vi.useFakeTimers()

    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await expect(cb.execute(fail)).rejects.toThrow()
    }
    expect(cb.getState()).toBe('OPEN')

    vi.advanceTimersByTime(RESET_TIMEOUT)

    const result = await cb.execute(succeed('recovered'))
    expect(result).toBe('recovered')
    // successThreshold=1이므로 바로 CLOSED
    expect(cb.getState()).toBe('CLOSED')
  })

  it('resetTimeout 미경과 시 OPEN 상태를 유지한다', async () => {
    vi.useFakeTimers()

    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await expect(cb.execute(fail)).rejects.toThrow()
    }

    vi.advanceTimersByTime(RESET_TIMEOUT - 1)

    await expect(cb.execute(fail)).rejects.toMatchObject({ code: 'E9502' })
    expect(cb.getState()).toBe('OPEN')
  })

  // ── HALF_OPEN ────────────────────────────────────────────────────────────

  it('HALF_OPEN에서 실패하면 즉시 OPEN으로 전환한다', async () => {
    vi.useFakeTimers()

    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await expect(cb.execute(fail)).rejects.toThrow()
    }

    vi.advanceTimersByTime(RESET_TIMEOUT)

    // HALF_OPEN에서 실패
    await expect(cb.execute(fail)).rejects.toThrow('service error')
    expect(cb.getState()).toBe('OPEN')
  })

  it('HALF_OPEN에서 successThreshold회 연속 성공 시 CLOSED로 전환한다', async () => {
    vi.useFakeTimers()

    const halfOpenCb = makeCircuitBreaker({ successThreshold: 2 })

    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await expect(halfOpenCb.execute(fail)).rejects.toThrow()
    }

    vi.advanceTimersByTime(RESET_TIMEOUT)

    // 첫 번째 성공 — 아직 HALF_OPEN
    await halfOpenCb.execute(succeed())
    expect(halfOpenCb.getState()).toBe('HALF_OPEN')

    // 두 번째 성공 — CLOSED
    await halfOpenCb.execute(succeed())
    expect(halfOpenCb.getState()).toBe('CLOSED')
  })

  // ── onStateChange ────────────────────────────────────────────────────────

  it('상태 전환마다 onStateChange 콜백이 호출된다', async () => {
    vi.useFakeTimers()

    const onStateChange = vi.fn()
    const trackedCb = makeCircuitBreaker({ successThreshold: 1, onStateChange })

    // CLOSED → OPEN
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await expect(trackedCb.execute(fail)).rejects.toThrow()
    }
    expect(onStateChange).toHaveBeenCalledWith('CLOSED', 'OPEN')

    // OPEN → HALF_OPEN
    vi.advanceTimersByTime(RESET_TIMEOUT)
    await trackedCb.execute(succeed())
    expect(onStateChange).toHaveBeenCalledWith('OPEN', 'HALF_OPEN')

    // HALF_OPEN → CLOSED
    expect(onStateChange).toHaveBeenCalledWith('HALF_OPEN', 'CLOSED')

    expect(onStateChange).toHaveBeenCalledTimes(3)
  })

  // ── reset ────────────────────────────────────────────────────────────────

  it('reset()이 OPEN 상태에서 CLOSED로 강제 초기화한다', async () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await expect(cb.execute(fail)).rejects.toThrow()
    }
    expect(cb.getState()).toBe('OPEN')

    cb.reset()
    expect(cb.getState()).toBe('CLOSED')

    // 초기화 후 정상 동작
    expect(await cb.execute(succeed())).toBe('ok')
  })

  it('reset() 후 onStateChange가 호출된다', async () => {
    const onStateChange = vi.fn()
    const trackedCb = makeCircuitBreaker({ onStateChange })

    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await expect(trackedCb.execute(fail)).rejects.toThrow()
    }
    onStateChange.mockClear()

    trackedCb.reset()
    expect(onStateChange).toHaveBeenCalledWith('OPEN', 'CLOSED')
  })
})
