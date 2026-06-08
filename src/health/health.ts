import type { DataSource } from 'typeorm'
import type { ForgeRedisClient } from '../redis'

/**
 * @description 단일 의존성의 상태를 점검하는 함수. 정상이면 resolve, 비정상이면 에러를 던진다
 * (reject)는 규약으로 동작한다. 던져진 에러의 `message`가 `HealthCheckResult.error`에 담긴다.
 */
export type HealthChecker = () => Promise<void>

export interface HealthCheckResult {
  name: string
  status: 'up' | 'down'
  error?: string
}

export interface HealthReport {
  status: 'ok' | 'error'
  checks: HealthCheckResult[]
}

/**
 * @description 여러 `HealthChecker`를 병렬로 실행해 표준화된 `HealthReport`로 집계한다.
 * `Promise.allSettled`를 사용하므로 일부 체커가 느리거나 실패해도 전체 응답이 막히지 않으며,
 * 하나라도 실패하면 전체 `status`는 `'error'`가 된다 (`/health` 엔드포인트의 응답 코드 결정에 사용).
 */
export async function checkHealth(checkers: Record<string, HealthChecker>): Promise<HealthReport> {
  const entries = Object.entries(checkers)

  const checks = await Promise.all(
    entries.map(async ([name, checker]): Promise<HealthCheckResult> => {
      try {
        await checker()
        return { name, status: 'up' }
      } catch (error) {
        return { name, status: 'down', error: error instanceof Error ? error.message : String(error) }
      }
    }),
  )

  const status = checks.every((check) => check.status === 'up') ? 'ok' : 'error'
  return { status, checks }
}

/**
 * @description TypeORM `DataSource`의 연결 상태를 점검하는 체커를 만든다. `SELECT 1` 쿼리를
 * 실행해 실제로 쿼리가 가능한지까지 확인한다 (단순히 `isInitialized` 플래그만 보지 않음).
 */
export function createDatabaseHealthChecker(dataSource: DataSource): HealthChecker {
  return async () => {
    if (!dataSource.isInitialized) {
      throw new Error('DataSource가 초기화되지 않았습니다')
    }
    await dataSource.query('SELECT 1')
  }
}

/**
 * @description `ForgeRedisClient`의 연결 상태를 점검하는 체커를 만든다. 내부적으로 `ping()`을
 * 사용하며, PONG 응답이 아니면(연결 실패 포함) 비정상으로 처리한다.
 */
export function createRedisHealthChecker(client: ForgeRedisClient): HealthChecker {
  return async () => {
    const isAlive = await client.ping()
    if (!isAlive) {
      throw new Error('Redis 서버로부터 PONG 응답을 받지 못했습니다')
    }
  }
}
