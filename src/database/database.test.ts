import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDataSource, runMigrations } from "./database";

const mockDataSource = {
  initialize: vi.fn().mockResolvedValue(undefined),
  destroy: vi.fn().mockResolvedValue(undefined),
  runMigrations: vi.fn().mockResolvedValue([]),
  isInitialized: false,
};

vi.mock("typeorm", () => ({
  DataSource: vi.fn().mockImplementation(() => mockDataSource),
}));

describe("createDataSource", () => {
  beforeEach(() => vi.clearAllMocks());

  it("TypeORM DataSource 인스턴스를 반환한다", () => {
    const ds = createDataSource({ type: "postgres", database: "test" });
    expect(ds).toBeDefined();
  });

  it("전달한 옵션으로 DataSource를 생성한다", async () => {
    const { DataSource } = await import("typeorm");
    createDataSource({ type: "postgres", host: "localhost", database: "mydb" });
    expect(DataSource).toHaveBeenCalledWith(
      expect.objectContaining({ type: "postgres", host: "localhost" }),
    );
  });
});

describe("runMigrations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDataSource.isInitialized = false;
  });

  it("초기화되지 않은 DataSource를 먼저 initialize한다", async () => {
    mockDataSource.isInitialized = false;
    const ds = createDataSource({ type: "postgres", database: "test" });
    await runMigrations(ds);
    expect(mockDataSource.initialize).toHaveBeenCalled();
    expect(mockDataSource.runMigrations).toHaveBeenCalled();
  });

  it("이미 초기화된 DataSource는 initialize를 건너뛴다", async () => {
    mockDataSource.isInitialized = true;
    const ds = createDataSource({ type: "postgres", database: "test" });
    await runMigrations(ds);
    expect(mockDataSource.initialize).not.toHaveBeenCalled();
    expect(mockDataSource.runMigrations).toHaveBeenCalled();
  });
});
