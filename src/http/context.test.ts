import { describe, it, expect } from "vitest";
import { buildTraceHeaders, buildTraceparentHeader } from "./context";

describe("buildTraceHeaders", () => {
  it("traceId와 requestId를 기본 헤더 이름으로 변환한다", () => {
    expect(buildTraceHeaders({ traceId: "trace-1", requestId: "req-1" })).toEqual({
      "x-trace-id": "trace-1",
      "x-request-id": "req-1",
    });
  });

  it("traceId만 있으면 requestId 헤더는 포함하지 않는다", () => {
    expect(buildTraceHeaders({ traceId: "trace-1" })).toEqual({ "x-trace-id": "trace-1" });
  });

  it("requestId만 있으면 traceId 헤더는 포함하지 않는다", () => {
    expect(buildTraceHeaders({ requestId: "req-1" })).toEqual({ "x-request-id": "req-1" });
  });

  it("둘 다 없으면 빈 객체를 반환한다", () => {
    expect(buildTraceHeaders({})).toEqual({});
  });

  it("headerNames로 헤더 이름을 커스터마이즈할 수 있다", () => {
    expect(
      buildTraceHeaders(
        { traceId: "trace-1", requestId: "req-1" },
        { traceId: "x-b3-traceid", requestId: "x-b3-spanid" },
      ),
    ).toEqual({
      "x-b3-traceid": "trace-1",
      "x-b3-spanid": "req-1",
    });
  });
});

describe("buildTraceparentHeader", () => {
  it("traceId가 있으면 traceparent 헤더를 반환한다", () => {
    const result = buildTraceparentHeader({ traceId: "4bf92f3577b34da6a3ce929d0e0e4736" });
    expect(result).toHaveProperty("traceparent");
    expect(result.traceparent).toMatch(/^00-4bf92f3577b34da6a3ce929d0e0e4736-[\da-f]{16}-01$/);
  });

  it("UUID traceId는 대시를 제거한 32-char hex로 변환된다", () => {
    const result = buildTraceparentHeader({ traceId: "550e8400-e29b-41d4-a716-446655440000" });
    expect(result.traceparent).toMatch(/^00-550e8400e29b41d4a716446655440000-[\da-f]{16}-01$/);
  });

  it("spanId를 지정하면 해당 값이 traceparent에 포함된다", () => {
    const result = buildTraceparentHeader(
      { traceId: "4bf92f3577b34da6a3ce929d0e0e4736" },
      "abc1234567890def",
    );
    expect(result.traceparent).toBe("00-4bf92f3577b34da6a3ce929d0e0e4736-abc1234567890def-01");
  });

  it("traceId가 없으면 빈 객체를 반환한다", () => {
    expect(buildTraceparentHeader({})).toEqual({});
  });

  it("buildTraceHeaders와 spread 조합 시 두 포맷 헤더를 모두 포함한다", () => {
    const ctx = { traceId: "4bf92f3577b34da6a3ce929d0e0e4736", requestId: "req-1" };
    const headers = { ...buildTraceHeaders(ctx), ...buildTraceparentHeader(ctx) };
    expect(headers).toHaveProperty("x-trace-id", "4bf92f3577b34da6a3ce929d0e0e4736");
    expect(headers).toHaveProperty("x-request-id", "req-1");
    expect(headers).toHaveProperty("traceparent");
  });
});
