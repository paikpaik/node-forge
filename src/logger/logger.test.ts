import { describe, it, expect, vi } from "vitest";
import { ForgeLogger, createLogger } from "./logger";

describe("ForgeLogger", () => {
  it("createLogger로 인스턴스를 생성한다", () => {
    const logger = createLogger({ level: "silent" });
    expect(logger).toBeInstanceOf(ForgeLogger);
  });

  it("withContext로 자식 로거를 생성한다", () => {
    const logger = createLogger({ level: "silent" });
    const child = logger.withContext({ traceId: "abc-123", requestId: "req-456" });
    expect(child).toBeInstanceOf(ForgeLogger);
    expect(child).not.toBe(logger);
  });

  it("로그 메서드가 에러 없이 호출된다", () => {
    const logger = createLogger({ level: "silent" });
    expect(() => {
      logger.info("info 메시지");
      logger.warn("warn 메시지");
      logger.debug("debug 메시지");
      logger.verbose("verbose 메시지");
      logger.log("log 메시지");
    }).not.toThrow();
  });

  it("error 메서드가 Error 객체와 함께 호출된다", () => {
    const logger = createLogger({ level: "silent" });
    expect(() => {
      logger.error("에러 발생", new Error("원인"), { userId: "123" });
    }).not.toThrow();
  });

  it("data와 함께 로그를 기록한다", () => {
    const logger = createLogger({ level: "silent" });
    expect(() => {
      logger.info("요청 처리", { requestId: "req-1", duration: 100 });
    }).not.toThrow();
  });

  it("silent 레벨에서 실제 출력을 하지 않는다", () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const logger = createLogger({ level: "silent" });
    logger.info("출력되지 않아야 함");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
