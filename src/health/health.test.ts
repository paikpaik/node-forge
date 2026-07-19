import { describe, it, expect, vi, afterEach } from "vitest";
import type { DataSource } from "typeorm";
import type { ForgeRedisClient } from "../redis";
import { checkHealth, createDatabaseHealthChecker, createRedisHealthChecker } from "./health";

describe("checkHealth", () => {
  it("모든 체커가 정상이면 status: ok를 반환한다", async () => {
    const report = await checkHealth({
      a: vi.fn().mockResolvedValue(undefined),
      b: vi.fn().mockResolvedValue(undefined),
    });

    expect(report).toEqual({
      status: "ok",
      checks: [
        { name: "a", status: "up" },
        { name: "b", status: "up" },
      ],
    });
  });

  it("하나라도 실패하면 status: error와 함께 실패 사유를 담는다", async () => {
    const report = await checkHealth({
      ok: vi.fn().mockResolvedValue(undefined),
      broken: vi.fn().mockRejectedValue(new Error("연결 실패")),
    });

    expect(report.status).toBe("error");
    expect(report.checks).toEqual([
      { name: "ok", status: "up" },
      { name: "broken", status: "down", error: "연결 실패" },
    ]);
  });

  it("체커가 없으면 status: ok와 빈 checks를 반환한다", async () => {
    expect(await checkHealth({})).toEqual({ status: "ok", checks: [] });
  });
});

describe("checkHealth cacheMs", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("cacheMs 이내의 반복 호출은 체커를 다시 실행하지 않고 캐시된 결과를 재사용한다", async () => {
    const checker = vi.fn().mockResolvedValue(undefined);
    const checkers = { a: checker };
    vi.spyOn(Date, "now").mockReturnValue(1_000);

    await checkHealth(checkers, { cacheMs: 5_000 });
    await checkHealth(checkers, { cacheMs: 5_000 });

    expect(checker).toHaveBeenCalledTimes(1);
  });

  it("cacheMs가 지나면 체커를 다시 실행한다", async () => {
    const checker = vi.fn().mockResolvedValue(undefined);
    const checkers = { a: checker };
    const now = vi.spyOn(Date, "now");

    now.mockReturnValue(1_000);
    await checkHealth(checkers, { cacheMs: 5_000 });

    now.mockReturnValue(7_000);
    await checkHealth(checkers, { cacheMs: 5_000 });

    expect(checker).toHaveBeenCalledTimes(2);
  });

  it("cacheMs를 생략하면 매 호출마다 체커를 실행한다(하위 호환)", async () => {
    const checker = vi.fn().mockResolvedValue(undefined);
    const checkers = { a: checker };

    await checkHealth(checkers);
    await checkHealth(checkers);

    expect(checker).toHaveBeenCalledTimes(2);
  });

  it("캐싱 중에는 실패 상태도 만료 전까지 그대로 유지된다", async () => {
    const checker = vi.fn().mockRejectedValue(new Error("연결 실패"));
    const checkers = { a: checker };
    vi.spyOn(Date, "now").mockReturnValue(1_000);

    const first = await checkHealth(checkers, { cacheMs: 5_000 });
    const second = await checkHealth(checkers, { cacheMs: 5_000 });

    expect(second).toEqual(first);
    expect(second.status).toBe("error");
    expect(checker).toHaveBeenCalledTimes(1);
  });
});

describe("createDatabaseHealthChecker", () => {
  it("isInitialized가 false면 에러를 던진다", async () => {
    const dataSource = { isInitialized: false, query: vi.fn() } as unknown as DataSource;
    const checker = createDatabaseHealthChecker(dataSource);

    await expect(checker()).rejects.toThrow("DataSource가 초기화되지 않았습니다");
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it("초기화되어 있으면 SELECT 1을 실행한다", async () => {
    const query = vi.fn().mockResolvedValue([{ "?column?": 1 }]);
    const dataSource = { isInitialized: true, query } as unknown as DataSource;
    const checker = createDatabaseHealthChecker(dataSource);

    await expect(checker()).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledWith("SELECT 1");
  });

  it("쿼리가 실패하면 에러를 그대로 전파한다", async () => {
    const query = vi.fn().mockRejectedValue(new Error("query failed"));
    const dataSource = { isInitialized: true, query } as unknown as DataSource;
    const checker = createDatabaseHealthChecker(dataSource);

    await expect(checker()).rejects.toThrow("query failed");
  });
});

describe("createRedisHealthChecker", () => {
  it("ping()이 true면 정상으로 처리한다", async () => {
    const client = { ping: vi.fn().mockResolvedValue(true) } as unknown as ForgeRedisClient;
    const checker = createRedisHealthChecker(client);

    await expect(checker()).resolves.toBeUndefined();
  });

  it("ping()이 false면 에러를 던진다", async () => {
    const client = { ping: vi.fn().mockResolvedValue(false) } as unknown as ForgeRedisClient;
    const checker = createRedisHealthChecker(client);

    await expect(checker()).rejects.toThrow("Redis 서버로부터 PONG 응답을 받지 못했습니다");
  });
});
