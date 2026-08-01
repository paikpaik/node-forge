import { describe, it, expect, vi, beforeEach } from "vitest";
import { DistributedCircuitBreaker } from "./circuit-breaker";
import type { ForgeRedisClient } from "./redis";

function makeRedis() {
  return {
    hgetall: vi.fn(),
    hmset: vi.fn(),
    hincrby: vi.fn(),
  } as unknown as ForgeRedisClient & {
    hgetall: ReturnType<typeof vi.fn>;
    hmset: ReturnType<typeof vi.fn>;
    hincrby: ReturnType<typeof vi.fn>;
  };
}

describe("DistributedCircuitBreaker", () => {
  let redis: ReturnType<typeof makeRedis>;
  let breaker: DistributedCircuitBreaker;

  beforeEach(() => {
    redis = makeRedis();
    breaker = new DistributedCircuitBreaker(redis, { failureThreshold: 3, resetTimeout: 1000 });
  });

  describe("getState", () => {
    it("저장된 레코드가 없으면 CLOSED를 반환한다", async () => {
      redis.hgetall.mockResolvedValue(null);
      expect(await breaker.getState("endpoint-a")).toBe("CLOSED");
      expect(redis.hgetall).toHaveBeenCalledWith("circuit:endpoint-a");
    });

    it("OPEN이고 resetTimeout이 지나지 않았으면 OPEN을 반환한다", async () => {
      redis.hgetall.mockResolvedValue({ state: "OPEN", failures: 3, openedAt: Date.now() - 100 });
      expect(await breaker.getState("endpoint-a")).toBe("OPEN");
    });

    it("OPEN이고 resetTimeout이 지났으면 HALF_OPEN을 반환한다", async () => {
      redis.hgetall.mockResolvedValue({
        state: "OPEN",
        failures: 3,
        openedAt: Date.now() - 2000,
      });
      expect(await breaker.getState("endpoint-a")).toBe("HALF_OPEN");
    });

    it("keyPrefix를 지정하면 그 접두사로 키를 만든다", async () => {
      const custom = new DistributedCircuitBreaker(redis, {
        failureThreshold: 3,
        resetTimeout: 1000,
        keyPrefix: "webhook",
      });
      redis.hgetall.mockResolvedValue(null);
      await custom.getState("endpoint-a");
      expect(redis.hgetall).toHaveBeenCalledWith("webhook:endpoint-a");
    });
  });

  describe("recordSuccess", () => {
    it("CLOSED이고 failures가 이미 0이면 아무 것도 쓰지 않는다", async () => {
      redis.hgetall.mockResolvedValue(null);
      await breaker.recordSuccess("endpoint-a");
      expect(redis.hmset).not.toHaveBeenCalled();
      expect(redis.hincrby).not.toHaveBeenCalled();
    });

    it("CLOSED인데 failures가 남아있으면 failures만 0으로 정리하고 onStateChange는 호출하지 않는다", async () => {
      const onStateChange = vi.fn();
      breaker = new DistributedCircuitBreaker(redis, {
        failureThreshold: 3,
        resetTimeout: 1000,
        onStateChange,
      });
      redis.hgetall.mockResolvedValue({ state: "CLOSED", failures: 2, openedAt: null });

      await breaker.recordSuccess("endpoint-a");

      expect(redis.hmset).toHaveBeenCalledWith("circuit:endpoint-a", { failures: 0 });
      expect(onStateChange).not.toHaveBeenCalled();
    });

    it("HALF_OPEN(저장값은 OPEN)이고 successThreshold(기본 1) 이상이면 CLOSED로 전환하고 onStateChange를 호출한다", async () => {
      const onStateChange = vi.fn();
      breaker = new DistributedCircuitBreaker(redis, {
        failureThreshold: 3,
        resetTimeout: 1000,
        onStateChange,
      });
      redis.hgetall.mockResolvedValue({ state: "OPEN", failures: 3, openedAt: Date.now() - 2000 });
      redis.hincrby.mockResolvedValue(1);

      await breaker.recordSuccess("endpoint-a");

      expect(redis.hincrby).toHaveBeenCalledWith("circuit:endpoint-a", "successes", 1);
      expect(redis.hmset).toHaveBeenCalledWith("circuit:endpoint-a", {
        state: "CLOSED",
        failures: 0,
        successes: 0,
        openedAt: null,
      });
      expect(onStateChange).toHaveBeenCalledWith("endpoint-a", "OPEN", "CLOSED");
    });

    it("successThreshold가 2 이상이면 첫 성공만으로는 전환하지 않는다", async () => {
      const onStateChange = vi.fn();
      breaker = new DistributedCircuitBreaker(redis, {
        failureThreshold: 3,
        resetTimeout: 1000,
        successThreshold: 2,
        onStateChange,
      });
      redis.hgetall.mockResolvedValue({ state: "OPEN", failures: 3, openedAt: Date.now() - 2000 });
      redis.hincrby.mockResolvedValue(1);

      await breaker.recordSuccess("endpoint-a");

      expect(redis.hmset).not.toHaveBeenCalled();
      expect(onStateChange).not.toHaveBeenCalled();
    });

    it("successThreshold가 2일 때 두 번째 성공에서 CLOSED로 전환한다", async () => {
      const onStateChange = vi.fn();
      breaker = new DistributedCircuitBreaker(redis, {
        failureThreshold: 3,
        resetTimeout: 1000,
        successThreshold: 2,
        onStateChange,
      });
      redis.hgetall.mockResolvedValue({ state: "OPEN", failures: 3, openedAt: Date.now() - 2000 });
      redis.hincrby.mockResolvedValue(2);

      await breaker.recordSuccess("endpoint-a");

      expect(redis.hmset).toHaveBeenCalledWith(
        "circuit:endpoint-a",
        expect.objectContaining({ state: "CLOSED" }),
      );
      expect(onStateChange).toHaveBeenCalledWith("endpoint-a", "OPEN", "CLOSED");
    });
  });

  describe("recordFailure", () => {
    it("CLOSED이고 failureThreshold 미만이면 카운터만 올리고 CLOSED를 반환한다", async () => {
      redis.hgetall.mockResolvedValue(null);
      redis.hincrby.mockResolvedValue(2);

      const result = await breaker.recordFailure("endpoint-a");

      expect(redis.hincrby).toHaveBeenCalledWith("circuit:endpoint-a", "failures", 1);
      expect(redis.hmset).not.toHaveBeenCalled();
      expect(result).toEqual({ state: "CLOSED" });
    });

    it("CLOSED이고 failureThreshold에 도달하면 OPEN으로 전환하고 onStateChange를 호출한다", async () => {
      const onStateChange = vi.fn();
      breaker = new DistributedCircuitBreaker(redis, {
        failureThreshold: 3,
        resetTimeout: 1000,
        onStateChange,
      });
      redis.hgetall.mockResolvedValue(null);
      redis.hincrby.mockResolvedValue(3);

      const result = await breaker.recordFailure("endpoint-a");

      expect(redis.hmset).toHaveBeenCalledWith(
        "circuit:endpoint-a",
        expect.objectContaining({ state: "OPEN", successes: 0, openedAt: expect.any(Number) }),
      );
      expect(onStateChange).toHaveBeenCalledWith("endpoint-a", "CLOSED", "OPEN");
      expect(result).toEqual({ state: "OPEN" });
    });

    it("이미 OPEN이면(HALF_OPEN 탐색 실패 포함) failures를 증가시키지 않고 즉시 재개방하며 onStateChange(OPEN,OPEN)을 호출한다", async () => {
      const onStateChange = vi.fn();
      breaker = new DistributedCircuitBreaker(redis, {
        failureThreshold: 3,
        resetTimeout: 1000,
        onStateChange,
      });
      redis.hgetall.mockResolvedValue({ state: "OPEN", failures: 3, openedAt: Date.now() - 2000 });

      const result = await breaker.recordFailure("endpoint-a");

      expect(redis.hincrby).not.toHaveBeenCalled();
      expect(redis.hmset).toHaveBeenCalledWith(
        "circuit:endpoint-a",
        expect.objectContaining({ state: "OPEN", successes: 0, openedAt: expect.any(Number) }),
      );
      expect(onStateChange).toHaveBeenCalledWith("endpoint-a", "OPEN", "OPEN");
      expect(result).toEqual({ state: "OPEN" });
    });
  });

  describe("execute", () => {
    it("CLOSED 상태면 fn을 실행하고 성공 시 결과를 반환한다", async () => {
      redis.hgetall.mockResolvedValue(null);
      const fn = vi.fn().mockResolvedValue("ok");

      const result = await breaker.execute("endpoint-a", fn);

      expect(result).toBe("ok");
      expect(fn).toHaveBeenCalled();
    });

    it("OPEN 상태면 fn을 호출하지 않고 E9502를 던진다", async () => {
      redis.hgetall.mockResolvedValue({ state: "OPEN", failures: 3, openedAt: Date.now() });
      const fn = vi.fn();

      await expect(breaker.execute("endpoint-a", fn)).rejects.toMatchObject({ code: "E9502" });
      expect(fn).not.toHaveBeenCalled();
    });

    it("HALF_OPEN으로 간주되면(OPEN + resetTimeout 경과) fn을 실행한다", async () => {
      redis.hgetall.mockResolvedValue({
        state: "OPEN",
        failures: 3,
        openedAt: Date.now() - 2000,
      });
      const fn = vi.fn().mockResolvedValue("recovered");

      const result = await breaker.execute("endpoint-a", fn);

      expect(result).toBe("recovered");
      expect(fn).toHaveBeenCalled();
    });

    it("fn이 실패하면 recordFailure를 호출하고 원본 에러를 그대로 던진다", async () => {
      redis.hgetall.mockResolvedValue(null);
      redis.hincrby.mockResolvedValue(1);
      const error = new Error("downstream boom");
      const fn = vi.fn().mockRejectedValue(error);

      await expect(breaker.execute("endpoint-a", fn)).rejects.toThrow("downstream boom");
      expect(redis.hincrby).toHaveBeenCalledWith("circuit:endpoint-a", "failures", 1);
    });
  });
});
