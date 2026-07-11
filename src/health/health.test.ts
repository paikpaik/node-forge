import { describe, it, expect, vi } from "vitest";
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
