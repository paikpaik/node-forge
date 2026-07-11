import { describe, it, expect, vi, beforeEach } from "vitest";
import { ForgeRedisClient, createRedisClient } from "./redis";

const mockClient = {
  ping: vi.fn(),
  disconnect: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  setex: vi.fn(),
  del: vi.fn(),
  exists: vi.fn(),
  expire: vi.fn(),
  ttl: vi.fn(),
  mget: vi.fn(),
  incr: vi.fn(),
  decr: vi.fn(),
  incrby: vi.fn(),
  decrby: vi.fn(),
  hget: vi.fn(),
  hset: vi.fn(),
  hmset: vi.fn(),
  hgetall: vi.fn(),
  hdel: vi.fn(),
  hexists: vi.fn(),
  hincrby: vi.fn(),
  lpush: vi.fn(),
  rpush: vi.fn(),
  lpop: vi.fn(),
  rpop: vi.fn(),
  lrange: vi.fn(),
  llen: vi.fn(),
  sadd: vi.fn(),
  srem: vi.fn(),
  smembers: vi.fn(),
  scard: vi.fn(),
  sismember: vi.fn(),
  sinter: vi.fn(),
  sunion: vi.fn(),
  sdiff: vi.fn(),
  zadd: vi.fn(),
  zrem: vi.fn(),
  zscore: vi.fn(),
  zincrby: vi.fn(),
  zrank: vi.fn(),
  zrevrank: vi.fn(),
  zrange: vi.fn(),
  zrevrange: vi.fn(),
  zcount: vi.fn(),
  zcard: vi.fn(),
  zpopmin: vi.fn(),
  zpopmax: vi.fn(),
  pipeline: vi.fn(),
  publish: vi.fn(),
  duplicate: vi.fn(),
  eval: vi.fn(),
  scan: vi.fn(),
  persist: vi.fn(),
};

vi.mock("ioredis", () => {
  const MockRedis = vi.fn().mockImplementation(() => mockClient);
  return { default: MockRedis };
});

describe("ForgeRedisClient", () => {
  let client: ForgeRedisClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createRedisClient();
  });

  // ── 연결 ────────────────────────────────────────────────────────────────

  it("createRedisClient로 인스턴스를 생성한다", () => {
    expect(client).toBeInstanceOf(ForgeRedisClient);
  });

  it("ping()이 PONG 응답 시 true를 반환한다", async () => {
    mockClient.ping.mockResolvedValue("PONG");
    expect(await client.ping()).toBe(true);
  });

  it("ping() 실패 시 false를 반환한다", async () => {
    mockClient.ping.mockRejectedValue(new Error("connection refused"));
    expect(await client.ping()).toBe(false);
  });

  it("getClient()로 ioredis 인스턴스를 반환한다", () => {
    expect(client.getClient()).toBeDefined();
  });

  it("disconnect()를 호출한다", async () => {
    await client.disconnect();
    expect(mockClient.disconnect).toHaveBeenCalled();
  });

  it("옵션이 전달되면 Redis 생성자에 적용된다", async () => {
    const { default: MockRedis } = await import("ioredis");
    createRedisClient({ host: "redis.internal", port: 6380, password: "secret", db: 1 });
    expect(MockRedis).toHaveBeenCalledWith(
      expect.objectContaining({ host: "redis.internal", port: 6380, db: 1 }),
    );
  });

  // ── String ──────────────────────────────────────────────────────────────

  describe("get", () => {
    it("저장된 값을 역직렬화해서 반환한다", async () => {
      mockClient.get.mockResolvedValue(JSON.stringify({ cachedAt: 1000, data: { name: "forge" } }));
      const result = await client.get<{ name: string }>("key");
      expect(result).toEqual({ name: "forge" });
    });

    it("키가 없으면 null을 반환한다", async () => {
      mockClient.get.mockResolvedValue(null);
      expect(await client.get("key")).toBeNull();
    });

    it("CachedItem 포맷이 아닌 raw 문자열은 그대로 반환한다", async () => {
      mockClient.get.mockResolvedValue("plain-string");
      expect(await client.get<string>("key")).toBe("plain-string");
    });
  });

  describe("set", () => {
    it("expireSeconds 없이 set을 호출한다", async () => {
      mockClient.set.mockResolvedValue("OK");
      await client.set("key", { value: 1 });
      expect(mockClient.set).toHaveBeenCalledWith(
        "key",
        expect.stringContaining('"data":{"value":1}'),
      );
    });

    it("expireSeconds > 0이면 setex를 호출한다", async () => {
      mockClient.setex.mockResolvedValue("OK");
      await client.set("key", "hello", 60);
      expect(mockClient.setex).toHaveBeenCalledWith("key", 60, expect.any(String));
    });

    it("expireSeconds === 0이면 del을 호출한다", async () => {
      mockClient.del.mockResolvedValue(1);
      await client.set("key", "hello", 0);
      expect(mockClient.del).toHaveBeenCalledWith("key");
    });
  });

  describe("del", () => {
    it("키를 삭제하고 삭제 수를 반환한다", async () => {
      mockClient.del.mockResolvedValue(2);
      expect(await client.del("a", "b")).toBe(2);
      expect(mockClient.del).toHaveBeenCalledWith("a", "b");
    });
  });

  describe("exists", () => {
    it("존재하는 키 수를 반환한다", async () => {
      mockClient.exists.mockResolvedValue(1);
      expect(await client.exists("key")).toBe(1);
    });
  });

  describe("expire", () => {
    it("TTL 설정 성공 시 true를 반환한다", async () => {
      mockClient.expire.mockResolvedValue(1);
      expect(await client.expire("key", 300)).toBe(true);
    });

    it("키가 없으면 false를 반환한다", async () => {
      mockClient.expire.mockResolvedValue(0);
      expect(await client.expire("key", 300)).toBe(false);
    });
  });

  describe("ttl", () => {
    it("남은 TTL 초를 반환한다", async () => {
      mockClient.ttl.mockResolvedValue(120);
      expect(await client.ttl("key")).toBe(120);
    });

    it("TTL 없는 키는 -1을 반환한다", async () => {
      mockClient.ttl.mockResolvedValue(-1);
      expect(await client.ttl("key")).toBe(-1);
    });
  });

  describe("persist", () => {
    it("TTL이 제거되면 true를 반환한다", async () => {
      mockClient.persist.mockResolvedValue(1);
      expect(await client.persist("key")).toBe(true);
      expect(mockClient.persist).toHaveBeenCalledWith("key");
    });

    it("키가 없거나 TTL이 없으면 false를 반환한다", async () => {
      mockClient.persist.mockResolvedValue(0);
      expect(await client.persist("key")).toBe(false);
    });
  });

  // ── Cache-aside & 비교키 무효화 ────────────────────────────────────────

  describe("getOrSet", () => {
    it("캐시가 있으면 fetchFn을 호출하지 않는다", async () => {
      mockClient.get.mockResolvedValue(JSON.stringify({ cachedAt: 1000, data: "cached" }));
      const fetchFn = vi.fn();
      expect(await client.getOrSet("key", fetchFn)).toBe("cached");
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it("캐시 미스 시 fetchFn을 호출하고 결과를 저장한다", async () => {
      mockClient.get.mockResolvedValue(null);
      mockClient.set.mockResolvedValue("OK");
      const fetchFn = vi.fn().mockResolvedValue("fresh");
      expect(await client.getOrSet("key", fetchFn)).toBe("fresh");
      expect(fetchFn).toHaveBeenCalledOnce();
      expect(mockClient.set).toHaveBeenCalledWith("key", expect.stringContaining('"data":"fresh"'));
    });

    it("expireSeconds를 전달하면 setex를 호출한다", async () => {
      mockClient.get.mockResolvedValue(null);
      mockClient.setex.mockResolvedValue("OK");
      const fetchFn = vi.fn().mockResolvedValue("value");
      await client.getOrSet("key", fetchFn, 60);
      expect(mockClient.setex).toHaveBeenCalledWith("key", 60, expect.any(String));
    });

    it("observer가 있고 캐시 hit이면 onHit만 호출한다", async () => {
      const observer = { onHit: vi.fn(), onMiss: vi.fn() };
      const clientWithObserver = new ForgeRedisClient({ observer });
      mockClient.get.mockResolvedValue(JSON.stringify({ cachedAt: 1000, data: "cached" }));
      await clientWithObserver.getOrSet("key", vi.fn());
      expect(observer.onHit).toHaveBeenCalledOnce();
      expect(observer.onMiss).not.toHaveBeenCalled();
    });

    it("observer가 있고 캐시 miss이면 onMiss만 호출한다", async () => {
      const observer = { onHit: vi.fn(), onMiss: vi.fn() };
      const clientWithObserver = new ForgeRedisClient({ observer });
      mockClient.get.mockResolvedValue(null);
      mockClient.set.mockResolvedValue("OK");
      await clientWithObserver.getOrSet("key", vi.fn().mockResolvedValue("fresh"));
      expect(observer.onMiss).toHaveBeenCalledOnce();
      expect(observer.onHit).not.toHaveBeenCalled();
    });
  });

  describe("singleflight", () => {
    it("활성화 시 동시 cache miss에서 fetchFn을 1번만 실행하고 결과를 공유한다", async () => {
      const sfClient = new ForgeRedisClient({ singleflight: true });
      mockClient.get.mockResolvedValue(null);
      mockClient.set.mockResolvedValue("OK");
      const fetchFn = vi.fn().mockResolvedValue("fresh");

      const results = await Promise.all([
        sfClient.getOrSet("key", fetchFn),
        sfClient.getOrSet("key", fetchFn),
        sfClient.getOrSet("key", fetchFn),
      ]);

      expect(fetchFn).toHaveBeenCalledOnce();
      expect(results).toEqual(["fresh", "fresh", "fresh"]);
    });

    it("비활성화(기본값) 시 동시 호출에서 fetchFn을 각각 실행한다", async () => {
      mockClient.get.mockResolvedValue(null);
      mockClient.set.mockResolvedValue("OK");
      const fetchFn = vi.fn().mockResolvedValue("fresh");

      await Promise.all([
        client.getOrSet("key", fetchFn),
        client.getOrSet("key", fetchFn),
        client.getOrSet("key", fetchFn),
      ]);

      expect(fetchFn).toHaveBeenCalledTimes(3);
    });

    it("fetchFn이 reject되면 _inflight 키가 제거되어 다음 호출이 재실행된다", async () => {
      const sfClient = new ForgeRedisClient({ singleflight: true });
      mockClient.get.mockResolvedValue(null);
      mockClient.set.mockResolvedValue("OK");
      const fetchFn = vi
        .fn()
        .mockRejectedValueOnce(new Error("fetch failed"))
        .mockResolvedValue("fresh");

      await expect(sfClient.getOrSet("key", fetchFn)).rejects.toThrow("fetch failed");
      const result = await sfClient.getOrSet("key", fetchFn);
      expect(result).toBe("fresh");
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it("cGetOrSet도 singleflight가 적용된다", async () => {
      const sfClient = new ForgeRedisClient({ singleflight: true });
      mockClient.mget.mockResolvedValue([null, null]);
      mockClient.set.mockResolvedValue("OK");
      const fetchFn = vi.fn().mockResolvedValue("fresh");

      const results = await Promise.all([
        sfClient.cGetOrSet("key", "cmpKey", fetchFn),
        sfClient.cGetOrSet("key", "cmpKey", fetchFn),
        sfClient.cGetOrSet("key", "cmpKey", fetchFn),
      ]);

      expect(fetchFn).toHaveBeenCalledOnce();
      expect(results).toEqual(["fresh", "fresh", "fresh"]);
    });
  });

  describe("getOrSetSwr", () => {
    const FRESH = JSON.stringify({ cachedAt: Date.now() - 10_000, data: "stale-value" });
    const STALE = JSON.stringify({ cachedAt: Date.now() - 120_000, data: "stale-value" });

    it("fresh 데이터이면 fetchFn을 호출하지 않고 즉시 반환한다", async () => {
      mockClient.get.mockResolvedValue(JSON.stringify({ cachedAt: Date.now(), data: "cached" }));
      const fetchFn = vi.fn();

      const result = await client.getOrSetSwr("key", fetchFn, {
        expireSeconds: 300,
        staleAfter: 60,
      });

      expect(result).toBe("cached");
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it("fresh이면 observer.onHit을 호출한다", async () => {
      const observer = { onHit: vi.fn(), onMiss: vi.fn() };
      const sfClient = new ForgeRedisClient({ observer });
      mockClient.get.mockResolvedValue(JSON.stringify({ cachedAt: Date.now(), data: "cached" }));

      await sfClient.getOrSetSwr("key", vi.fn(), { expireSeconds: 300, staleAfter: 60 });

      expect(observer.onHit).toHaveBeenCalledOnce();
      expect(observer.onMiss).not.toHaveBeenCalled();
    });

    it("stale 데이터이면 즉시 stale 값을 반환하고 백그라운드에서 fetchFn을 실행한다", async () => {
      mockClient.get.mockResolvedValue(STALE);
      mockClient.set.mockResolvedValue("OK");
      const fetchFn = vi.fn().mockResolvedValue("fresh");

      const result = await client.getOrSetSwr("key", fetchFn, {
        expireSeconds: 300,
        staleAfter: 60,
      });

      expect(result).toBe("stale-value");
      // 백그라운드 갱신 완료 대기
      await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledOnce());
    });

    it("stale이면 observer.onMiss를 호출한다", async () => {
      const observer = { onHit: vi.fn(), onMiss: vi.fn() };
      const sfClient = new ForgeRedisClient({ observer });
      mockClient.get.mockResolvedValue(STALE);
      mockClient.set.mockResolvedValue("OK");

      await sfClient.getOrSetSwr("key", vi.fn().mockResolvedValue("fresh"), {
        expireSeconds: 300,
        staleAfter: 60,
      });

      expect(observer.onMiss).toHaveBeenCalledOnce();
      expect(observer.onHit).not.toHaveBeenCalled();
    });

    it("키가 없으면 blocking fetch 후 반환한다", async () => {
      mockClient.get.mockResolvedValue(null);
      mockClient.set.mockResolvedValue("OK");
      const fetchFn = vi.fn().mockResolvedValue("fresh");

      const result = await client.getOrSetSwr("key", fetchFn, {
        expireSeconds: 300,
        staleAfter: 60,
      });

      expect(result).toBe("fresh");
      expect(fetchFn).toHaveBeenCalledOnce();
    });

    it("stale 상태 동시 호출 시 fetchFn은 1번만 실행된다", async () => {
      mockClient.get.mockResolvedValue(FRESH);
      mockClient.set.mockResolvedValue("OK");
      const fetchFn = vi.fn().mockResolvedValue("fresh");

      await Promise.all([
        client.getOrSetSwr("key", fetchFn, { expireSeconds: 300, staleAfter: 5 }),
        client.getOrSetSwr("key", fetchFn, { expireSeconds: 300, staleAfter: 5 }),
        client.getOrSetSwr("key", fetchFn, { expireSeconds: 300, staleAfter: 5 }),
      ]);

      await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledOnce());
    });
  });

  describe("cGet", () => {
    it("데이터가 compareKey보다 최신이면 데이터를 반환한다", async () => {
      mockClient.mget.mockResolvedValue([
        JSON.stringify({ cachedAt: 2000, data: { id: 1 } }),
        JSON.stringify({ cachedAt: 1000, data: null }),
      ]);
      expect(await client.cGet("data:key", "cmp:key")).toEqual({ id: 1 });
    });

    it("데이터가 compareKey보다 오래됐으면 null을 반환한다 (stale)", async () => {
      mockClient.mget.mockResolvedValue([
        JSON.stringify({ cachedAt: 1000, data: { id: 1 } }),
        JSON.stringify({ cachedAt: 2000, data: null }),
      ]);
      expect(await client.cGet("data:key", "cmp:key")).toBeNull();
    });

    it("데이터 키가 없으면 null을 반환한다", async () => {
      mockClient.mget.mockResolvedValue([null, JSON.stringify({ cachedAt: 1000, data: null })]);
      expect(await client.cGet("data:key", "cmp:key")).toBeNull();
    });

    it("compareKey가 없으면 cachedAt=0 기준으로 비교해 데이터를 반환한다", async () => {
      mockClient.mget.mockResolvedValue([JSON.stringify({ cachedAt: 500, data: "value" }), null]);
      expect(await client.cGet("data:key", "cmp:key")).toBe("value");
    });
  });

  describe("cGetOrSet", () => {
    it("최신 데이터면 fetchFn을 호출하지 않는다", async () => {
      mockClient.mget.mockResolvedValue([
        JSON.stringify({ cachedAt: 2000, data: "fresh" }),
        JSON.stringify({ cachedAt: 1000, data: null }),
      ]);
      const fetchFn = vi.fn();
      expect(await client.cGetOrSet("key", "cmp", fetchFn)).toBe("fresh");
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it("stale이면 fetchFn을 호출하고 다시 저장한다", async () => {
      mockClient.mget.mockResolvedValue([
        JSON.stringify({ cachedAt: 1000, data: "old" }),
        JSON.stringify({ cachedAt: 2000, data: null }),
      ]);
      mockClient.set.mockResolvedValue("OK");
      const fetchFn = vi.fn().mockResolvedValue("new");
      expect(await client.cGetOrSet("key", "cmp", fetchFn)).toBe("new");
      expect(fetchFn).toHaveBeenCalledOnce();
    });

    it("observer가 있고 캐시 hit이면 onHit만 호출한다", async () => {
      const observer = { onHit: vi.fn(), onMiss: vi.fn() };
      const clientWithObserver = new ForgeRedisClient({ observer });
      mockClient.mget.mockResolvedValue([
        JSON.stringify({ cachedAt: 2000, data: "fresh" }),
        JSON.stringify({ cachedAt: 1000, data: null }),
      ]);
      await clientWithObserver.cGetOrSet("key", "cmp", vi.fn());
      expect(observer.onHit).toHaveBeenCalledOnce();
      expect(observer.onMiss).not.toHaveBeenCalled();
    });

    it("observer가 있고 stale이면 onMiss만 호출한다", async () => {
      const observer = { onHit: vi.fn(), onMiss: vi.fn() };
      const clientWithObserver = new ForgeRedisClient({ observer });
      mockClient.mget.mockResolvedValue([
        JSON.stringify({ cachedAt: 1000, data: "old" }),
        JSON.stringify({ cachedAt: 2000, data: null }),
      ]);
      mockClient.set.mockResolvedValue("OK");
      await clientWithObserver.cGetOrSet("key", "cmp", vi.fn().mockResolvedValue("new"));
      expect(observer.onMiss).toHaveBeenCalledOnce();
      expect(observer.onHit).not.toHaveBeenCalled();
    });
  });

  describe("invalidate", () => {
    it("compareKey에 현재 시각으로 set을 호출한다", async () => {
      mockClient.set.mockResolvedValue("OK");
      await client.invalidate("cmp:key");
      expect(mockClient.set).toHaveBeenCalledWith("cmp:key", expect.stringContaining('"cachedAt"'));
    });
  });

  // ── 분산 락 ───────────────────────────────────────────────────────────────

  describe("lock", () => {
    it("락 획득에 성공하면 토큰 문자열을 반환한다", async () => {
      mockClient.set.mockResolvedValue("OK");
      const token = await client.lock("job:batch", 30);
      expect(token).toEqual(expect.any(String));
      expect(mockClient.set).toHaveBeenCalledWith("job:batch", token, "PX", 30000, "NX");
    });

    it("이미 다른 프로세스가 락을 보유 중이면 null을 반환한다", async () => {
      mockClient.set.mockResolvedValue(null);
      expect(await client.lock("job:batch", 30)).toBeNull();
    });
  });

  describe("unlock", () => {
    it("토큰이 일치하면 락을 해제하고 true를 반환한다", async () => {
      mockClient.eval.mockResolvedValue(1);
      expect(await client.unlock("job:batch", "token-123")).toBe(true);
      expect(mockClient.eval).toHaveBeenCalledWith(expect.any(String), 1, "job:batch", "token-123");
    });

    it("토큰이 일치하지 않으면 락을 해제하지 않고 false를 반환한다", async () => {
      mockClient.eval.mockResolvedValue(0);
      expect(await client.unlock("job:batch", "wrong-token")).toBe(false);
    });
  });

  describe("withLock", () => {
    it("락 획득 성공 시 fn 결과를 반환한다", async () => {
      mockClient.set.mockResolvedValue("OK");
      mockClient.eval.mockResolvedValue(1);
      const result = await client.withLock("job:run", 30, async () => "done");
      expect(result).toBe("done");
    });

    it("fn 실행 후 unlock을 호출한다", async () => {
      mockClient.set.mockResolvedValue("OK");
      mockClient.eval.mockResolvedValue(1);
      await client.withLock("job:run", 30, async () => 42);
      expect(mockClient.eval).toHaveBeenCalledOnce();
    });

    it("fn이 에러를 던져도 unlock을 호출하고 에러를 전파한다", async () => {
      mockClient.set.mockResolvedValue("OK");
      mockClient.eval.mockResolvedValue(1);
      await expect(
        client.withLock("job:run", 30, async () => {
          throw new Error("fn error");
        }),
      ).rejects.toThrow("fn error");
      expect(mockClient.eval).toHaveBeenCalledOnce();
    });

    it("락 획득 실패 시 ForgeError(E9501)를 던진다", async () => {
      mockClient.set.mockResolvedValue(null);
      await expect(client.withLock("job:run", 30, async () => "ok")).rejects.toMatchObject({
        code: "E9501",
      });
      expect(mockClient.eval).not.toHaveBeenCalled();
    });

    it("에러 메시지에 key가 포함된다", async () => {
      mockClient.set.mockResolvedValue(null);
      await expect(client.withLock("batch:heavy", 30, async () => "ok")).rejects.toThrow(
        "batch:heavy",
      );
    });

    it("retries 설정 시 재시도 중 성공하면 fn 결과를 반환한다", async () => {
      mockClient.set
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce("OK");
      mockClient.eval.mockResolvedValue(1);
      const result = await client.withLock("job:run", 30, async () => "ok", {
        retries: 2,
        retryDelay: 0,
      });
      expect(result).toBe("ok");
      expect(mockClient.set).toHaveBeenCalledTimes(3);
      expect(mockClient.eval).toHaveBeenCalledTimes(1);
    });

    it("모든 재시도 실패 시 E9501을 던진다", async () => {
      mockClient.set.mockResolvedValue(null);
      await expect(
        client.withLock("job:run", 30, async () => "ok", { retries: 2, retryDelay: 0 }),
      ).rejects.toMatchObject({ code: "E9501" });
      expect(mockClient.set).toHaveBeenCalledTimes(3);
    });
  });

  // ── Rate Limiter ──────────────────────────────────────────────────────────

  describe("checkRateLimit", () => {
    it("한도 이내면 limited=false와 남은 횟수를 반환한다", async () => {
      const mockPipeline = {
        incr: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([
          [null, 3],
          [null, 1],
        ]),
      };
      mockClient.pipeline.mockReturnValue(mockPipeline);
      expect(await client.checkRateLimit("user:1:api", 100, 60)).toEqual({
        limited: false,
        remaining: 97,
      });
      expect(mockPipeline.incr).toHaveBeenCalledWith("user:1:api");
      expect(mockPipeline.expire).toHaveBeenCalledWith("user:1:api", 60, "NX");
    });

    it("한도를 초과하면 limited=true와 remaining=0을 반환한다", async () => {
      const mockPipeline = {
        incr: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([
          [null, 101],
          [null, 0],
        ]),
      };
      mockClient.pipeline.mockReturnValue(mockPipeline);
      expect(await client.checkRateLimit("user:1:api", 100, 60)).toEqual({
        limited: true,
        remaining: 0,
      });
    });
  });

  // ── 일괄 쓰기 / 안전한 키 검색 ────────────────────────────────────────────

  describe("mset", () => {
    it("여러 키-값을 pipeline으로 직렬화해 저장한다", async () => {
      const mockPipeline = {
        set: vi.fn().mockReturnThis(),
        setex: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([]),
      };
      mockClient.pipeline.mockReturnValue(mockPipeline);
      await client.mset({ "user:1": { id: 1 }, "user:2": { id: 2 } });
      expect(mockPipeline.set).toHaveBeenCalledWith(
        "user:1",
        expect.stringContaining('"cachedAt"'),
      );
      expect(mockPipeline.set).toHaveBeenCalledWith(
        "user:2",
        expect.stringContaining('"cachedAt"'),
      );
      expect(mockPipeline.exec).toHaveBeenCalled();
    });

    it("expireSeconds를 전달하면 setex로 TTL과 함께 저장한다", async () => {
      const mockPipeline = {
        set: vi.fn().mockReturnThis(),
        setex: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([]),
      };
      mockClient.pipeline.mockReturnValue(mockPipeline);
      await client.mset({ "user:1": { id: 1 } }, 3600);
      expect(mockPipeline.setex).toHaveBeenCalledWith(
        "user:1",
        3600,
        expect.stringContaining('"cachedAt"'),
      );
    });

    it("빈 객체를 전달하면 pipeline을 생성하지 않는다", async () => {
      await client.mset({});
      expect(mockClient.pipeline).not.toHaveBeenCalled();
    });
  });

  describe("scanKeys", () => {
    it("cursor가 0이 될 때까지 반복해 매칭되는 모든 키를 수집한다", async () => {
      mockClient.scan
        .mockResolvedValueOnce(["5", ["session:1", "session:2"]])
        .mockResolvedValueOnce(["0", ["session:3"]]);
      expect(await client.scanKeys("session:*")).toEqual(["session:1", "session:2", "session:3"]);
      expect(mockClient.scan).toHaveBeenCalledWith("0", "MATCH", "session:*", "COUNT", 100);
      expect(mockClient.scan).toHaveBeenCalledWith("5", "MATCH", "session:*", "COUNT", 100);
    });

    it("매칭되는 키가 없으면 빈 배열을 반환한다", async () => {
      mockClient.scan.mockResolvedValueOnce(["0", []]);
      expect(await client.scanKeys("none:*")).toEqual([]);
    });
  });

  // ── Counter ─────────────────────────────────────────────────────────────

  describe("incr", () => {
    it("키를 1 증가하고 결과를 반환한다", async () => {
      mockClient.incr.mockResolvedValue(3);
      expect(await client.incr("counter")).toBe(3);
      expect(mockClient.incr).toHaveBeenCalledWith("counter");
    });
  });

  describe("decr", () => {
    it("키를 1 감소하고 결과를 반환한다", async () => {
      mockClient.decr.mockResolvedValue(1);
      expect(await client.decr("counter")).toBe(1);
      expect(mockClient.decr).toHaveBeenCalledWith("counter");
    });
  });

  describe("incrby", () => {
    it("키를 n만큼 증가하고 결과를 반환한다", async () => {
      mockClient.incrby.mockResolvedValue(10);
      expect(await client.incrby("counter", 5)).toBe(10);
      expect(mockClient.incrby).toHaveBeenCalledWith("counter", 5);
    });
  });

  describe("decrby", () => {
    it("키를 n만큼 감소하고 결과를 반환한다", async () => {
      mockClient.decrby.mockResolvedValue(0);
      expect(await client.decrby("counter", 5)).toBe(0);
      expect(mockClient.decrby).toHaveBeenCalledWith("counter", 5);
    });
  });

  // ── Hash ────────────────────────────────────────────────────────────────

  describe("hget", () => {
    it("필드 값을 역직렬화해서 반환한다", async () => {
      mockClient.hget.mockResolvedValue(JSON.stringify({ score: 100 }));
      expect(await client.hget("hash", "field")).toEqual({ score: 100 });
    });

    it("필드가 없으면 null을 반환한다", async () => {
      mockClient.hget.mockResolvedValue(null);
      expect(await client.hget("hash", "field")).toBeNull();
    });

    it("JSON 파싱 불가한 값은 그대로 반환한다", async () => {
      mockClient.hget.mockResolvedValue("plain");
      expect(await client.hget<string>("hash", "field")).toBe("plain");
    });
  });

  describe("hset", () => {
    it("필드를 JSON 직렬화해서 저장한다", async () => {
      mockClient.hset.mockResolvedValue(1);
      await client.hset("hash", "field", { score: 100 });
      expect(mockClient.hset).toHaveBeenCalledWith("hash", "field", '{"score":100}');
    });
  });

  describe("hmset", () => {
    it("여러 필드를 한 번에 저장한다", async () => {
      mockClient.hmset.mockResolvedValue("OK");
      await client.hmset("hash", { a: 1, b: "hello" });
      expect(mockClient.hmset).toHaveBeenCalledWith("hash", { a: "1", b: '"hello"' });
    });
  });

  describe("hgetall", () => {
    it("모든 필드를 역직렬화해서 반환한다", async () => {
      mockClient.hgetall.mockResolvedValue({ a: "1", b: '"hello"' });
      expect(await client.hgetall("hash")).toEqual({ a: 1, b: "hello" });
    });

    it("빈 해시는 null을 반환한다", async () => {
      mockClient.hgetall.mockResolvedValue({});
      expect(await client.hgetall("hash")).toBeNull();
    });

    it("키가 없으면 null을 반환한다", async () => {
      mockClient.hgetall.mockResolvedValue(null);
      expect(await client.hgetall("hash")).toBeNull();
    });
  });

  describe("hdel", () => {
    it("필드를 삭제하고 삭제 수를 반환한다", async () => {
      mockClient.hdel.mockResolvedValue(2);
      expect(await client.hdel("hash", "a", "b")).toBe(2);
      expect(mockClient.hdel).toHaveBeenCalledWith("hash", "a", "b");
    });
  });

  describe("hexists", () => {
    it("필드가 존재하면 true를 반환한다", async () => {
      mockClient.hexists.mockResolvedValue(1);
      expect(await client.hexists("hash", "field")).toBe(true);
    });

    it("필드가 없으면 false를 반환한다", async () => {
      mockClient.hexists.mockResolvedValue(0);
      expect(await client.hexists("hash", "field")).toBe(false);
    });
  });

  describe("hincrby", () => {
    it("해시 필드를 n만큼 증가하고 결과를 반환한다", async () => {
      mockClient.hincrby.mockResolvedValue(15);
      expect(await client.hincrby("hash", "score", 5)).toBe(15);
      expect(mockClient.hincrby).toHaveBeenCalledWith("hash", "score", 5);
    });
  });

  // ── List ────────────────────────────────────────────────────────────────

  describe("lpush", () => {
    it("값을 JSON 직렬화해서 리스트 앞에 추가한다", async () => {
      mockClient.lpush.mockResolvedValue(2);
      expect(await client.lpush("list", { id: 1 }, { id: 2 })).toBe(2);
      expect(mockClient.lpush).toHaveBeenCalledWith("list", '{"id":1}', '{"id":2}');
    });
  });

  describe("rpush", () => {
    it("값을 JSON 직렬화해서 리스트 뒤에 추가한다", async () => {
      mockClient.rpush.mockResolvedValue(3);
      expect(await client.rpush("list", "a", "b")).toBe(3);
      expect(mockClient.rpush).toHaveBeenCalledWith("list", '"a"', '"b"');
    });
  });

  describe("lpop", () => {
    it("count 없이 호출하면 단일 값을 반환한다", async () => {
      mockClient.lpop.mockResolvedValue('{"id":1}');
      expect(await client.lpop<{ id: number }>("list")).toEqual({ id: 1 });
    });

    it("키가 없으면 null을 반환한다", async () => {
      mockClient.lpop.mockResolvedValue(null);
      expect(await client.lpop("list")).toBeNull();
    });

    it("count를 전달하면 배열을 반환한다", async () => {
      mockClient.lpop.mockResolvedValue(['{"id":1}', '{"id":2}']);
      expect(await client.lpop<{ id: number }>("list", 2)).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it("count 전달 시 빈 리스트면 빈 배열을 반환한다", async () => {
      mockClient.lpop.mockResolvedValue(null);
      expect(await client.lpop("list", 2)).toEqual([]);
    });
  });

  describe("rpop", () => {
    it("count 없이 호출하면 단일 값을 반환한다", async () => {
      mockClient.rpop.mockResolvedValue('"hello"');
      expect(await client.rpop<string>("list")).toBe("hello");
    });

    it("count를 전달하면 배열을 반환한다", async () => {
      mockClient.rpop.mockResolvedValue(['"x"', '"y"']);
      expect(await client.rpop<string>("list", 2)).toEqual(["x", "y"]);
    });
  });

  describe("lrange", () => {
    it("범위 내 요소를 역직렬화해서 반환한다", async () => {
      mockClient.lrange.mockResolvedValue(['{"a":1}', '{"a":2}']);
      expect(await client.lrange("list", 0, 1)).toEqual([{ a: 1 }, { a: 2 }]);
    });

    it("빈 리스트는 빈 배열을 반환한다", async () => {
      mockClient.lrange.mockResolvedValue([]);
      expect(await client.lrange("list", 0, -1)).toEqual([]);
    });
  });

  describe("llen", () => {
    it("리스트 길이를 반환한다", async () => {
      mockClient.llen.mockResolvedValue(5);
      expect(await client.llen("list")).toBe(5);
    });
  });

  // ── Set ─────────────────────────────────────────────────────────────────

  describe("sadd", () => {
    it("멤버를 추가하고 추가된 수를 반환한다", async () => {
      mockClient.sadd.mockResolvedValue(2);
      expect(await client.sadd("set", "a", "b")).toBe(2);
      expect(mockClient.sadd).toHaveBeenCalledWith("set", "a", "b");
    });
  });

  describe("srem", () => {
    it("멤버를 제거하고 제거된 수를 반환한다", async () => {
      mockClient.srem.mockResolvedValue(1);
      expect(await client.srem("set", "a")).toBe(1);
      expect(mockClient.srem).toHaveBeenCalledWith("set", "a");
    });
  });

  describe("smembers", () => {
    it("셋의 모든 멤버를 반환한다", async () => {
      mockClient.smembers.mockResolvedValue(["a", "b", "c"]);
      expect(await client.smembers("set")).toEqual(["a", "b", "c"]);
    });
  });

  describe("scard", () => {
    it("셋의 멤버 수를 반환한다", async () => {
      mockClient.scard.mockResolvedValue(3);
      expect(await client.scard("set")).toBe(3);
    });
  });

  describe("sismember", () => {
    it("멤버가 존재하면 true를 반환한다", async () => {
      mockClient.sismember.mockResolvedValue(1);
      expect(await client.sismember("set", "a")).toBe(true);
    });

    it("멤버가 없으면 false를 반환한다", async () => {
      mockClient.sismember.mockResolvedValue(0);
      expect(await client.sismember("set", "x")).toBe(false);
    });
  });

  describe("sinter", () => {
    it("여러 셋의 교집합을 반환한다", async () => {
      mockClient.sinter.mockResolvedValue(["common"]);
      expect(await client.sinter("set:1", "set:2")).toEqual(["common"]);
      expect(mockClient.sinter).toHaveBeenCalledWith("set:1", "set:2");
    });
  });

  describe("sunion", () => {
    it("여러 셋의 합집합을 반환한다", async () => {
      mockClient.sunion.mockResolvedValue(["a", "b", "c"]);
      expect(await client.sunion("set:1", "set:2")).toEqual(["a", "b", "c"]);
      expect(mockClient.sunion).toHaveBeenCalledWith("set:1", "set:2");
    });
  });

  describe("sdiff", () => {
    it("첫 번째 셋에서 이후 셋들과 겹치지 않는 멤버(차집합)를 반환한다", async () => {
      mockClient.sdiff.mockResolvedValue(["only-in-first"]);
      expect(await client.sdiff("set:1", "set:2")).toEqual(["only-in-first"]);
      expect(mockClient.sdiff).toHaveBeenCalledWith("set:1", "set:2");
    });
  });

  // ── Sorted Set ──────────────────────────────────────────────────────────

  describe("zadd", () => {
    it("score-member 쌍을 평탄화해서 zadd를 호출한다", async () => {
      mockClient.zadd.mockResolvedValue(2);
      expect(
        await client.zadd("rank", [
          { score: 100, member: "user:1" },
          { score: 200, member: "user:2" },
        ]),
      ).toBe(2);
      expect(mockClient.zadd).toHaveBeenCalledWith("rank", 100, "user:1", 200, "user:2");
    });

    it("빈 배열이면 0을 반환하고 zadd를 호출하지 않는다", async () => {
      expect(await client.zadd("rank", [])).toBe(0);
      expect(mockClient.zadd).not.toHaveBeenCalled();
    });
  });

  describe("zrem", () => {
    it("멤버를 제거하고 제거 수를 반환한다", async () => {
      mockClient.zrem.mockResolvedValue(1);
      expect(await client.zrem("rank", "user:1")).toBe(1);
    });
  });

  describe("zscore", () => {
    it("멤버의 점수를 number로 반환한다", async () => {
      mockClient.zscore.mockResolvedValue("1500.5");
      expect(await client.zscore("rank", "user:1")).toBe(1500.5);
    });

    it("멤버가 없으면 null을 반환한다", async () => {
      mockClient.zscore.mockResolvedValue(null);
      expect(await client.zscore("rank", "none")).toBeNull();
    });
  });

  describe("zincrby", () => {
    it("점수를 증가하고 새 점수를 반환한다", async () => {
      mockClient.zincrby.mockResolvedValue("1700");
      expect(await client.zincrby("rank", "user:1", 200)).toBe(1700);
      expect(mockClient.zincrby).toHaveBeenCalledWith("rank", 200, "user:1");
    });
  });

  describe("zrank / zrevrank", () => {
    it("zrank은 오름차순 순위를 반환한다 (0-based)", async () => {
      mockClient.zrank.mockResolvedValue(2);
      expect(await client.zrank("rank", "user:1")).toBe(2);
    });

    it("zrevrank는 내림차순 순위를 반환한다 (0-based)", async () => {
      mockClient.zrevrank.mockResolvedValue(0);
      expect(await client.zrevrank("rank", "user:1")).toBe(0);
    });

    it("멤버가 없으면 null을 반환한다", async () => {
      mockClient.zrank.mockResolvedValue(null);
      expect(await client.zrank("rank", "none")).toBeNull();
    });
  });

  describe("zrange / zrevrange", () => {
    it("zrange는 오름차순 멤버 목록을 반환한다", async () => {
      mockClient.zrange.mockResolvedValue(["user:1", "user:2"]);
      expect(await client.zrange("rank", 0, 1)).toEqual(["user:1", "user:2"]);
    });

    it("zrevrange는 내림차순 멤버 목록을 반환한다", async () => {
      mockClient.zrevrange.mockResolvedValue(["user:2", "user:1"]);
      expect(await client.zrevrange("rank", 0, 1)).toEqual(["user:2", "user:1"]);
    });
  });

  describe("zrangeWithScores / zrevrangeWithScores", () => {
    it("zrangeWithScores는 { member, score }[] 를 반환한다", async () => {
      mockClient.zrange.mockResolvedValue(["user:1", "100", "user:2", "200"]);
      expect(await client.zrangeWithScores("rank", 0, 1)).toEqual([
        { member: "user:1", score: 100 },
        { member: "user:2", score: 200 },
      ]);
      expect(mockClient.zrange).toHaveBeenCalledWith("rank", 0, 1, "WITHSCORES");
    });

    it("zrevrangeWithScores는 내림차순 { member, score }[] 를 반환한다", async () => {
      mockClient.zrevrange.mockResolvedValue(["user:2", "200", "user:1", "100"]);
      expect(await client.zrevrangeWithScores("rank", 0, 1)).toEqual([
        { member: "user:2", score: 200 },
        { member: "user:1", score: 100 },
      ]);
    });
  });

  describe("zcount / zcard", () => {
    it("zcount는 범위 내 멤버 수를 반환한다", async () => {
      mockClient.zcount.mockResolvedValue(5);
      expect(await client.zcount("rank", 100, 500)).toBe(5);
      expect(mockClient.zcount).toHaveBeenCalledWith("rank", 100, 500);
    });

    it("zcount는 -inf / +inf를 지원한다", async () => {
      mockClient.zcount.mockResolvedValue(10);
      expect(await client.zcount("rank", "-inf", "+inf")).toBe(10);
    });

    it("zcard는 전체 멤버 수를 반환한다", async () => {
      mockClient.zcard.mockResolvedValue(10);
      expect(await client.zcard("rank")).toBe(10);
    });
  });

  describe("zpopmin / zpopmax", () => {
    it("zpopmin은 score가 가장 낮은 멤버를 조회와 동시에 제거한다", async () => {
      mockClient.zpopmin.mockResolvedValue(["user:1", "100"]);
      expect(await client.zpopmin("rank")).toEqual([{ member: "user:1", score: 100 }]);
      expect(mockClient.zpopmin).toHaveBeenCalledWith("rank", 1);
    });

    it("zpopmin은 count만큼 오름차순으로 반환한다", async () => {
      mockClient.zpopmin.mockResolvedValue(["user:1", "100", "user:2", "200"]);
      expect(await client.zpopmin("rank", 2)).toEqual([
        { member: "user:1", score: 100 },
        { member: "user:2", score: 200 },
      ]);
      expect(mockClient.zpopmin).toHaveBeenCalledWith("rank", 2);
    });

    it("zpopmax는 score가 가장 높은 멤버를 조회와 동시에 제거한다", async () => {
      mockClient.zpopmax.mockResolvedValue(["user:2", "200"]);
      expect(await client.zpopmax("rank")).toEqual([{ member: "user:2", score: 200 }]);
      expect(mockClient.zpopmax).toHaveBeenCalledWith("rank", 1);
    });

    it("zpopmax는 count만큼 내림차순으로 반환한다", async () => {
      mockClient.zpopmax.mockResolvedValue(["user:2", "200", "user:1", "100"]);
      expect(await client.zpopmax("rank", 2)).toEqual([
        { member: "user:2", score: 200 },
        { member: "user:1", score: 100 },
      ]);
    });
  });

  // ── 랭킹 헬퍼 ───────────────────────────────────────────────────────────

  describe("getTopN", () => {
    it("상위 N명을 1-based rank와 함께 반환한다", async () => {
      mockClient.zrevrange.mockResolvedValue(["user:2", "200", "user:1", "100"]);
      const result = await client.getTopN("rank", 2);
      expect(result).toEqual([
        { member: "user:2", score: 200, rank: 1 },
        { member: "user:1", score: 100, rank: 2 },
      ]);
      expect(mockClient.zrevrange).toHaveBeenCalledWith("rank", 0, 1, "WITHSCORES");
    });

    it("빈 랭킹은 빈 배열을 반환한다", async () => {
      mockClient.zrevrange.mockResolvedValue([]);
      expect(await client.getTopN("rank", 10)).toEqual([]);
    });
  });

  describe("getRankAndScore", () => {
    it("rank(1-based)와 score를 함께 반환한다", async () => {
      const mockPipeline = {
        zrevrank: vi.fn().mockReturnThis(),
        zscore: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([
          [null, 0],
          [null, "1500"],
        ]),
      };
      mockClient.pipeline.mockReturnValue(mockPipeline);
      expect(await client.getRankAndScore("rank", "user:1")).toEqual({ rank: 1, score: 1500 });
    });

    it("멤버가 없으면 rank와 score 모두 null을 반환한다", async () => {
      const mockPipeline = {
        zrevrank: vi.fn().mockReturnThis(),
        zscore: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([
          [null, null],
          [null, null],
        ]),
      };
      mockClient.pipeline.mockReturnValue(mockPipeline);
      expect(await client.getRankAndScore("rank", "none")).toEqual({ rank: null, score: null });
    });
  });

  // ── Pub/Sub ──────────────────────────────────────────────────────────────

  describe("publish", () => {
    it("값을 JSON 직렬화해서 발행하고 수신자 수를 반환한다", async () => {
      mockClient.publish.mockResolvedValue(2);
      expect(await client.publish("ch", { event: "update" })).toBe(2);
      expect(mockClient.publish).toHaveBeenCalledWith("ch", '{"event":"update"}');
    });
  });

  describe("subscribe", () => {
    it("duplicate()로 subscriber를 생성하고 채널을 구독한다", () => {
      const mockSubscriber = {
        subscribe: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
        disconnect: vi.fn(),
        unsubscribe: vi.fn().mockResolvedValue(undefined),
      };
      mockClient.duplicate.mockReturnValue(mockSubscriber);

      const handler = vi.fn();
      client.subscribe("ch", handler);

      expect(mockClient.duplicate).toHaveBeenCalledOnce();
      expect(mockSubscriber.subscribe).toHaveBeenCalledWith("ch");
    });

    it("두 번 subscribe해도 duplicate()는 한 번만 호출한다", () => {
      const mockSubscriber = {
        subscribe: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
        disconnect: vi.fn(),
        unsubscribe: vi.fn().mockResolvedValue(undefined),
      };
      mockClient.duplicate.mockReturnValue(mockSubscriber);

      client.subscribe("ch1", vi.fn());
      client.subscribe("ch2", vi.fn());

      expect(mockClient.duplicate).toHaveBeenCalledOnce();
      expect(mockSubscriber.subscribe).toHaveBeenCalledTimes(2);
    });

    it("message 이벤트 수신 시 핸들러를 JSON 역직렬화해서 호출한다", () => {
      let messageListener: ((ch: string, msg: string) => void) | null = null;
      const mockSubscriber = {
        subscribe: vi.fn().mockResolvedValue(undefined),
        on: vi.fn((event, cb) => {
          if (event === "message") messageListener = cb;
        }),
        disconnect: vi.fn(),
        unsubscribe: vi.fn().mockResolvedValue(undefined),
      };
      mockClient.duplicate.mockReturnValue(mockSubscriber);

      const handler = vi.fn();
      client.subscribe("ch", handler);
      messageListener!("ch", '{"id":1}');

      expect(handler).toHaveBeenCalledWith({ id: 1 });
    });

    it("다른 채널 메시지는 핸들러를 호출하지 않는다", () => {
      let messageListener: ((ch: string, msg: string) => void) | null = null;
      const mockSubscriber = {
        subscribe: vi.fn().mockResolvedValue(undefined),
        on: vi.fn((event, cb) => {
          if (event === "message") messageListener = cb;
        }),
        disconnect: vi.fn(),
        unsubscribe: vi.fn().mockResolvedValue(undefined),
      };
      mockClient.duplicate.mockReturnValue(mockSubscriber);

      const handler = vi.fn();
      client.subscribe("ch", handler);
      messageListener!("other", '{"id":1}');

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("unsubscribe", () => {
    it("채널을 구독 해제한다", async () => {
      const mockSubscriber = {
        subscribe: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
        disconnect: vi.fn(),
        unsubscribe: vi.fn().mockResolvedValue(undefined),
      };
      mockClient.duplicate.mockReturnValue(mockSubscriber);

      client.subscribe("ch", vi.fn());
      await client.unsubscribe("ch");

      expect(mockSubscriber.unsubscribe).toHaveBeenCalledWith("ch");
    });
  });

  describe("disconnect (with subscriber)", () => {
    it("subscriber가 있으면 함께 disconnect한다", async () => {
      const mockSubscriber = {
        subscribe: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
        disconnect: vi.fn(),
        unsubscribe: vi.fn().mockResolvedValue(undefined),
      };
      mockClient.duplicate.mockReturnValue(mockSubscriber);

      client.subscribe("ch", vi.fn());
      await client.disconnect();

      expect(mockSubscriber.disconnect).toHaveBeenCalled();
      expect(mockClient.disconnect).toHaveBeenCalled();
    });
  });

  // ── Key utility ─────────────────────────────────────────────────────────

  describe("buildKey", () => {
    it("파트를 콜론으로 연결한다", () => {
      expect(client.buildKey("user", "123", "profile")).toBe("user:123:profile");
    });

    it("단일 파트도 그대로 반환한다", () => {
      expect(client.buildKey("session")).toBe("session");
    });

    it("빈 문자열 파트는 제외한다", () => {
      expect(client.buildKey("user", "", "123")).toBe("user:123");
    });
  });

  describe("mget", () => {
    it("여러 키를 한 번에 조회한다", async () => {
      mockClient.mget.mockResolvedValue([
        JSON.stringify({ cachedAt: 1000, data: "a" }),
        JSON.stringify({ cachedAt: 2000, data: "b" }),
        null,
      ]);
      const result = await client.mget<string>(["k1", "k2", "k3"]);
      expect(result).toEqual(["a", "b", null]);
    });

    it("빈 배열이면 빈 배열을 반환한다", async () => {
      expect(await client.mget([])).toEqual([]);
      expect(mockClient.mget).not.toHaveBeenCalled();
    });
  });
});
