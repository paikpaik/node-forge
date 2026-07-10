import { chunk } from './utils'
import { mapConcurrent, sleep } from './async'

export interface BatchOptions {
  /** 한 번에 처리할 항목 수 */
  chunkSize: number
  /** 청크 내 동시 처리 수. 기본값 1 (순차) */
  concurrency?: number
  /** 청크 간 대기 ms. 기본값 0 (즉시) */
  delayMs?: number
  /** 청크 처리 완료 후 호출되는 콜백. `processed`는 누적 처리 수, `total`은 전체 수. */
  onChunkComplete?: (processed: number, total: number) => void
}

/**
 * @description items를 chunkSize 단위로 나눠 순차 처리한다. 각 청크 내에서는
 * concurrency 수만큼 fn을 동시에 실행하며, 청크 사이에 delayMs만큼 대기한다.
 * fn의 두 번째 인수는 원본 배열 기준 전역 인덱스다.
 * 하나라도 실패하면 즉시 throw한다 (fail-fast).
 */
export async function processBatch<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  options: BatchOptions,
): Promise<R[]> {
  const { chunkSize, concurrency = 1, delayMs = 0, onChunkComplete } = options

  if (chunkSize <= 0) {
    throw new Error(`chunkSize must be greater than 0, got ${chunkSize}`)
  }

  if (items.length === 0) return []

  const chunks = chunk(items, chunkSize)
  const results: R[] = []

  for (let i = 0; i < chunks.length; i++) {
    const currentChunk = chunks[i]
    const baseIndex = i * chunkSize

    const chunkResults = await mapConcurrent(
      currentChunk,
      (item, localIdx) => fn(item, baseIndex + localIdx),
      concurrency,
    )

    results.push(...chunkResults)
    onChunkComplete?.(Math.min((i + 1) * chunkSize, items.length), items.length)

    if (delayMs > 0 && i < chunks.length - 1) {
      await sleep(delayMs)
    }
  }

  return results
}
