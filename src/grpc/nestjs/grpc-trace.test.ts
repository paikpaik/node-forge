import { describe, it, expect } from "vitest";
import { buildOutgoingTraceMetadata } from "./grpc-trace";
import { runWithRequestContext } from "../../core";

describe("buildOutgoingTraceMetadata", () => {
  it("요청 컨텍스트가 없으면 traceparent를 넣지 않는다", () => {
    const metadata = buildOutgoingTraceMetadata();
    expect(metadata.get("traceparent")).toEqual([]);
  });

  it("요청 컨텍스트가 있으면 현재 traceId로 traceparent를 만들어 담는다", () => {
    const metadata = runWithRequestContext(
      { traceId: "4bf92f3577b34da6a3ce929d0e0e4736", requestId: "r1" },
      () => buildOutgoingTraceMetadata(),
    );

    const [value] = metadata.get("traceparent");
    expect(value).toContain("4bf92f3577b34da6a3ce929d0e0e4736");
  });
});
