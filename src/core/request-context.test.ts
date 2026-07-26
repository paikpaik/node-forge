import { describe, it, expect } from "vitest";
import { runWithRequestContext, getRequestContext } from "./request-context";

describe("getRequestContext", () => {
  it("runWithRequestContext 바깥에서는 undefined를 반환한다", () => {
    expect(getRequestContext()).toBeUndefined();
  });

  it("runWithRequestContext 안의 동기 코드에서 컨텍스트를 꺼낼 수 있다", () => {
    const result = runWithRequestContext({ traceId: "t1", requestId: "r1" }, () => {
      return getRequestContext();
    });
    expect(result).toEqual({ traceId: "t1", requestId: "r1" });
  });

  it("await 이후의 비동기 코드에도 컨텍스트가 전파된다", async () => {
    const captured = await runWithRequestContext({ traceId: "t2", requestId: "r2" }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return getRequestContext();
    });
    expect(captured).toEqual({ traceId: "t2", requestId: "r2" });
  });

  it("동시에 실행되는 두 컨텍스트가 서로 섞이지 않는다", async () => {
    const [a, b] = await Promise.all([
      runWithRequestContext({ traceId: "a", requestId: "a" }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return getRequestContext()?.traceId;
      }),
      runWithRequestContext({ traceId: "b", requestId: "b" }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return getRequestContext()?.traceId;
      }),
    ]);
    expect(a).toBe("a");
    expect(b).toBe("b");
  });
});
