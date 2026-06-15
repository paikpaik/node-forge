import { describe, it, expect, vi, afterEach } from 'vitest'
import { processBatch } from './batch'

afterEach(() => vi.useRealTimers())

describe('processBatch', () => {
  // ── 기본 동작 ────────────────────────────────────────────────────────────

  it('결과를 입력 배열과 같은 순서로 반환한다', async () => {
    const results = await processBatch(
      [1, 2, 3, 4, 5],
      async (n) => n * 10,
      { chunkSize: 2 },
    )
    expect(results).toEqual([10, 20, 30, 40, 50])
  })

  it('fn에 전달되는 index는 원본 배열 기준 전역 인덱스다', async () => {
    const indices: number[] = []
    await processBatch(
      ['a', 'b', 'c', 'd', 'e'],
      async (_, i) => { indices.push(i); return i },
      { chunkSize: 2 },
    )
    expect(indices).toEqual([0, 1, 2, 3, 4])
  })

  it('빈 배열을 입력하면 빈 배열을 반환한다', async () => {
    const results = await processBatch([], async (n: number) => n, { chunkSize: 10 })
    expect(results).toEqual([])
  })

  it('items.length가 chunkSize보다 작아도 정상 처리된다', async () => {
    const results = await processBatch([1, 2], async (n) => n * 2, { chunkSize: 100 })
    expect(results).toEqual([2, 4])
  })

  // ── chunkSize ────────────────────────────────────────────────────────────

  it('chunkSize <= 0이면 에러를 던진다', async () => {
    await expect(
      processBatch([1, 2, 3], async (n) => n, { chunkSize: 0 }),
    ).rejects.toThrow('chunkSize must be greater than 0')

    await expect(
      processBatch([1, 2, 3], async (n) => n, { chunkSize: -1 }),
    ).rejects.toThrow('chunkSize must be greater than 0')
  })

  // ── concurrency ──────────────────────────────────────────────────────────

  it('concurrency로 청크 내 동시 실행 수를 제한한다', async () => {
    let concurrent = 0
    let maxConcurrent = 0

    await processBatch(
      [1, 2, 3, 4, 5, 6],
      async (n) => {
        concurrent++
        maxConcurrent = Math.max(maxConcurrent, concurrent)
        await Promise.resolve()
        concurrent--
        return n
      },
      { chunkSize: 6, concurrency: 2 },
    )

    expect(maxConcurrent).toBeLessThanOrEqual(2)
    expect(maxConcurrent).toBeGreaterThan(0)
  })

  it('concurrency 기본값은 1(순차)이다', async () => {
    const order: number[] = []
    await processBatch(
      [1, 2, 3],
      async (n) => { order.push(n); return n },
      { chunkSize: 3 },
    )
    expect(order).toEqual([1, 2, 3])
  })

  // ── onChunkComplete ───────────────────────────────────────────────────────

  it('onChunkComplete가 청크마다 올바른 processed/total로 호출된다', async () => {
    const calls: [number, number][] = []
    await processBatch(
      [1, 2, 3, 4, 5],
      async (n) => n,
      {
        chunkSize: 2,
        onChunkComplete: (processed, total) => calls.push([processed, total]),
      },
    )
    // chunk: [1,2] → processed=2, [3,4] → 4, [5] → 5
    expect(calls).toEqual([[2, 5], [4, 5], [5, 5]])
  })

  it('onChunkComplete 없이도 정상 동작한다', async () => {
    const results = await processBatch([1, 2, 3], async (n) => n, { chunkSize: 2 })
    expect(results).toEqual([1, 2, 3])
  })

  // ── delayMs ───────────────────────────────────────────────────────────────

  it('청크 사이에 delayMs만큼 대기한다', async () => {
    vi.useFakeTimers()

    let resolved = false
    const p = processBatch(
      [1, 2, 3, 4],
      async (n) => n,
      { chunkSize: 2, delayMs: 500 },
    ).then((r) => { resolved = true; return r })

    // 첫 청크 처리 후 delay 중
    await vi.advanceTimersByTimeAsync(499)
    expect(resolved).toBe(false)

    // delay 완료 → 두 번째 청크 처리
    await vi.advanceTimersByTimeAsync(1)
    const results = await p
    expect(resolved).toBe(true)
    expect(results).toEqual([1, 2, 3, 4])
  })

  it('마지막 청크 이후에는 sleep을 호출하지 않는다', async () => {
    vi.useFakeTimers()

    const p = processBatch([1, 2], async (n) => n, { chunkSize: 2, delayMs: 10_000 })
    // 단일 청크면 sleep 없이 즉시 완료
    const results = await p
    expect(results).toEqual([1, 2])
  })

  // ── fail-fast ─────────────────────────────────────────────────────────────

  it('fn이 실패하면 즉시 throw한다', async () => {
    const fn = async (n: number) => {
      if (n === 3) throw new Error('failed at 3')
      return n
    }
    await expect(
      processBatch([1, 2, 3, 4, 5], fn, { chunkSize: 5 }),
    ).rejects.toThrow('failed at 3')
  })
})
