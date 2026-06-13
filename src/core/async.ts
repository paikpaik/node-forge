/**
 * @description ms만큼 대기한 후 resolve한다.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * @description promise가 ms 안에 완료되지 않으면 reject한다.
 * timeout이 발생해도 원래 promise는 취소되지 않고 계속 실행된다 — 취소가 필요하면
 * 호출부에서 AbortController를 직접 사용해야 한다.
 */
export function timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms),
  )
  return Promise.race([promise, timeoutPromise])
}

export interface RetryOptions {
  /** 최대 재시도 횟수. 총 실행 횟수는 retries + 1이다. */
  retries: number
  /** 첫 번째 재시도 전 대기 ms. 기본값 0 (즉시 재시도). */
  delay?: number
  /** 지수 백오프 배율. 기본값 1 (고정 지연). 2이면 delay → delay*2 → delay*4 ... */
  factor?: number
  /** 재시도 직전 호출되는 콜백. 에러 로깅이나 메트릭 기록에 활용한다. */
  onRetry?: (error: unknown, attempt: number) => void
}

/**
 * @description fn이 reject되면 retries 횟수까지 재시도한다. 모든 시도가 실패하면
 * 마지막 에러를 그대로 reject한다. delay + factor 조합으로 지수 백오프를 구성할 수 있다.
 */
export async function retry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const { retries, delay = 0, factor = 1, onRetry } = options
  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt < retries) {
        onRetry?.(error, attempt + 1)
        if (delay > 0) {
          await sleep(delay * Math.pow(factor, attempt))
        }
      }
    }
  }

  throw lastError
}

/**
 * @description arr의 각 요소를 fn으로 처리하되 동시 실행 수를 concurrency로 제한한다.
 * 입력 배열과 같은 순서로 결과를 반환하며, 하나라도 reject되면 전체가 reject된다.
 * concurrency가 0 이하이면 에러를 던진다.
 */
export async function mapConcurrent<T, R>(
  arr: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  if (concurrency <= 0) {
    throw new Error(`concurrency must be greater than 0, got ${concurrency}`)
  }

  const results: R[] = new Array(arr.length)
  let next = 0

  async function worker(): Promise<void> {
    while (next < arr.length) {
      const i = next++
      results[i] = await fn(arr[i], i)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, arr.length) }, () => worker()),
  )

  return results
}
