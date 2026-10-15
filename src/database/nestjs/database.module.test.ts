import "reflect-metadata";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

// 실제 DB에 붙지 않도록 DataSource를 가짜로 바꾼다 — 초기화·종료 호출만 확인한다
const fakeDataSource = {
  isInitialized: false,
  initialize: vi.fn(async () => {
    fakeDataSource.isInitialized = true;
  }),
  destroy: vi.fn(async () => {
    fakeDataSource.isInitialized = false;
  }),
};
vi.mock("../database", () => ({
  createDataSource: () => fakeDataSource,
}));

const { DatabaseModule } = await import("./database.module");

beforeEach(() => {
  fakeDataSource.isInitialized = false;
  fakeDataSource.initialize.mockClear();
  fakeDataSource.destroy.mockClear();
});

describe("DatabaseModule 라이프사이클", () => {
  it("forRoot: 앱을 닫으면 연결 풀을 닫는다", async () => {
    @Module({ imports: [DatabaseModule.forRoot({ type: "mysql" })] })
    class AppModule {}

    const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    expect(fakeDataSource.initialize).toHaveBeenCalledTimes(1);

    await app.close();

    expect(fakeDataSource.destroy).toHaveBeenCalledTimes(1);
  });

  it("forRootAsync: 앱을 닫으면 연결 풀을 닫는다", async () => {
    @Module({ imports: [DatabaseModule.forRootAsync({ useFactory: () => ({ type: "mysql" as const }) })] })
    class AppModule {}

    const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    await app.close();

    expect(fakeDataSource.destroy).toHaveBeenCalledTimes(1);
  });

  it("이미 닫힌 연결은 다시 닫지 않는다", async () => {
    @Module({ imports: [DatabaseModule.forRoot({ type: "mysql" })] })
    class AppModule {}

    const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    fakeDataSource.isInitialized = false;
    await app.close();

    expect(fakeDataSource.destroy).not.toHaveBeenCalled();
  });
});
