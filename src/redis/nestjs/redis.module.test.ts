import "reflect-metadata";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

// 실제 Redis에 붙지 않도록 클라이언트를 가짜로 바꾼다 — 연결 생성·종료 호출만 확인한다
const disconnect = vi.fn(async () => undefined);
vi.mock("../redis", () => ({
  ForgeRedisClient: class {
    disconnect = disconnect;
  },
}));

const { RedisModule } = await import("./redis.module");
const { REDIS_CLIENT } = await import("./redis.constants");

beforeEach(() => {
  disconnect.mockClear();
});

describe("RedisModule 라이프사이클", () => {
  it("forRoot: 앱을 닫으면 Redis 연결을 닫는다", async () => {
    @Module({ imports: [RedisModule.forRoot({ host: "127.0.0.1" })] })
    class AppModule {}

    const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    expect(app.get(REDIS_CLIENT)).toBeDefined();
    expect(disconnect).not.toHaveBeenCalled();

    await app.close();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("forRootAsync: 앱을 닫으면 Redis 연결을 닫는다", async () => {
    @Module({ imports: [RedisModule.forRootAsync({ useFactory: () => ({ host: "127.0.0.1" }) })] })
    class AppModule {}

    const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    await app.close();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
