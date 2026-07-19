import type { DataSource } from "typeorm";
import type { ForgeRedisClient } from "../redis";

/**
 * @description 단일 의존성의 상태를 점검하는 함수. 정상이면 resolve, 비정상이면 에러를 던진다
 * (reject)는 규약으로 동작한다. 던져진 에러의 `message`가 `HealthCheckResult.error`에 담긴다.
 */
export type HealthChecker = () => Promise<void>;

export interface HealthCheckResult {
  name: string;
  status: "up" | "down";
  error?: string;
}

export interface HealthReport {
  status: "ok" | "error";
  checks: HealthCheckResult[];
}

export interface CheckHealthOptions {
  /** 이 시간(ms) 안의 반복 호출은 체커를 다시 실행하지 않고 마지막 결과를 재사용한다. 생략하면 캐싱 없음(기존 동작). */
  cacheMs?: number;
}

const reportCache = new WeakMap<Record<string, HealthChecker>, { cachedAt: number; report: HealthReport }>();

/**
 * @description 여러 `HealthChecker`를 병렬로 실행해 표준화된 `HealthReport`로 집계한다.
 * `Promise.allSettled`를 사용하므로 일부 체커가 느리거나 실패해도 전체 응답이 막히지 않으며,
 * 하나라도 실패하면 전체 `status`는 `'error'`가 된다 (`/health` 엔드포인트의 응답 코드 결정에 사용).
 *
 * `options.cacheMs`를 지정하면, 동일한 `checkers` 객체로 그 시간(ms) 안에 다시 호출될 때
 * 체커를 재실행하지 않고 마지막 `HealthReport`를 그대로 반환한다. Kafka Admin 연결처럼 체커
 * 자체가 무거운 경우, `/health`를 짧은 간격으로 반복 호출하는 오케스트레이터 환경에서 비용을 줄인다.
 */
export async function checkHealth(
  checkers: Record<string, HealthChecker>,
  options: CheckHealthOptions = {},
): Promise<HealthReport> {
  if (options.cacheMs !== undefined) {
    const cached = reportCache.get(checkers);
    if (cached && Date.now() - cached.cachedAt < options.cacheMs) {
      return cached.report;
    }
  }

  const entries = Object.entries(checkers);

  const checks = await Promise.all(
    entries.map(async ([name, checker]): Promise<HealthCheckResult> => {
      try {
        await checker();
        return { name, status: "up" };
      } catch (error) {
        return {
          name,
          status: "down",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );

  const status = checks.every((check) => check.status === "up") ? "ok" : "error";
  const report: HealthReport = { status, checks };

  if (options.cacheMs !== undefined) {
    reportCache.set(checkers, { cachedAt: Date.now(), report });
  }

  return report;
}

/**
 * @description TypeORM `DataSource`의 연결 상태를 점검하는 체커를 만든다. `SELECT 1` 쿼리를
 * 실행해 실제로 쿼리가 가능한지까지 확인한다 (단순히 `isInitialized` 플래그만 보지 않음).
 */
export function createDatabaseHealthChecker(dataSource: DataSource): HealthChecker {
  return async () => {
    if (!dataSource.isInitialized) {
      throw new Error("DataSource가 초기화되지 않았습니다");
    }
    await dataSource.query("SELECT 1");
  };
}

/**
 * @description `ForgeRedisClient`의 연결 상태를 점검하는 체커를 만든다. 내부적으로 `ping()`을
 * 사용하며, PONG 응답이 아니면(연결 실패 포함) 비정상으로 처리한다.
 */
export function createRedisHealthChecker(client: ForgeRedisClient): HealthChecker {
  return async () => {
    const isAlive = await client.ping();
    if (!isAlive) {
      throw new Error("Redis 서버로부터 PONG 응답을 받지 못했습니다");
    }
  };
}
