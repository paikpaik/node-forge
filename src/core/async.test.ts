import { describe, it, expect, vi, afterEach } from "vitest";
import { sleep, timeout, retry, mapConcurrent, type RetryOptions } from "./async";

describe("sleep", () => {
  afterEach(() => vi.useRealTimers());

  it("지정한 ms 후에 resolve된다", async () => {
    vi.useFakeTimers();
    let resolved = false;

    const p = sleep(500).then(() => {
      resolved = true;
    });

    expect(resolved).toBe(false);
    vi.advanceTimersByTime(499);
    await Promise.resolve();
    expect(resolved).toBe(false);

    vi.advanceTimersByTime(1);
    await p;
    expect(resolved).toBe(true);
  });

  it("0ms이면 즉시 resolve된다", async () => {
    vi.useFakeTimers();
    const p = sleep(0);
    vi.advanceTimersByTime(0);
    await p;
  });
});

describe("timeout", () => {
  afterEach(() => vi.useRealTimers());

  it("지정 시간 내 완료되면 결과를 그대로 반환한다", async () => {
    vi.useFakeTimers();
    const p = Promise.resolve(42);
    const result = await timeout(p, 1000);
    expect(result).toBe(42);
  });

  it("시간 초과 시 에러를 던진다", async () => {
    vi.useFakeTimers();

    const never = new Promise<number>(() => {});
    const p = timeout(never, 500);

    vi.advanceTimersByTime(500);

    await expect(p).rejects.toThrow("timed out after 500ms");
  });

  it("에러 메시지에 ms 값이 포함된다", async () => {
    vi.useFakeTimers();

    const never = new Promise<number>(() => {});
    const p = timeout(never, 1200);

    vi.advanceTimersByTime(1200);

    await expect(p).rejects.toThrow("1200ms");
  });
});

describe("retry", () => {
  it("첫 시도에 성공하면 한 번만 실행한다", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await retry(fn, { retries: 3 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries 횟수만큼 재시도한다", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValue("ok");

    const result = await retry(fn, { retries: 3 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("모든 시도 실패 시 마지막 에러를 던진다", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockRejectedValue(new Error("final fail"));

    await expect(retry(fn, { retries: 2 })).rejects.toThrow("final fail");
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("onRetry 콜백이 재시도마다 호출된다", async () => {
    const onRetry = vi.fn();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("e1"))
      .mockRejectedValueOnce(new Error("e2"))
      .mockResolvedValue("ok");

    await retry(fn, { retries: 3, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, expect.any(Error), 1);
    expect(onRetry).toHaveBeenNthCalledWith(2, expect.any(Error), 2);
  });

  it("retries: 0이면 재시도 없이 바로 throw한다", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("no retry"));
    await expect(retry(fn, { retries: 0 })).rejects.toThrow("no retry");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("delay 옵션으로 대기한다", async () => {
    vi.useFakeTimers();

    const fn = vi.fn().mockRejectedValueOnce(new Error("fail")).mockResolvedValue("ok");

    const p = retry(fn, { retries: 1, delay: 300 });

    // 첫 실패 직후 아직 resolve 안됨
    await vi.advanceTimersByTimeAsync(299);
    expect(fn).toHaveBeenCalledTimes(1);

    // 300ms 경과 후 재시도
    await vi.advanceTimersByTimeAsync(1);
    await p;

    expect(fn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("factor로 지수 백오프를 적용한다", async () => {
    const delays: number[] = [];
    const origSleep = globalThis.setTimeout;

    vi.useFakeTimers();

    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("e1"))
      .mockRejectedValueOnce(new Error("e2"))
      .mockResolvedValue("ok");

    const options: RetryOptions = {
      retries: 2,
      delay: 100,
      factor: 2,
      onRetry: (_, attempt) => delays.push(attempt),
    };

    const p = retry(fn, options);
    // attempt 0 fail → delay 100 * 2^0 = 100ms
    await vi.advanceTimersByTimeAsync(100);
    // attempt 1 fail → delay 100 * 2^1 = 200ms
    await vi.advanceTimersByTimeAsync(200);
    await p;

    expect(delays).toEqual([1, 2]);
    vi.useRealTimers();
    void origSleep;
  });
});

describe("mapConcurrent", () => {
  it("결과를 입력 배열과 같은 순서로 반환한다", async () => {
    const results = await mapConcurrent([1, 2, 3, 4, 5], async (n) => n * 10, 2);
    expect(results).toEqual([10, 20, 30, 40, 50]);
  });

  it("index를 두 번째 인수로 전달한다", async () => {
    const results = await mapConcurrent(["a", "b", "c"], async (item, i) => `${i}:${item}`, 2);
    expect(results).toEqual(["0:a", "1:b", "2:c"]);
  });

  it("동시 실행 수를 concurrency로 제한한다", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    await mapConcurrent(
      [1, 2, 3, 4, 5, 6],
      async (n) => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await Promise.resolve();
        concurrent--;
        return n;
      },
      2,
    );

    expect(maxConcurrent).toBeLessThanOrEqual(2);
    expect(maxConcurrent).toBeGreaterThan(0);
  });

  it("빈 배열을 입력하면 빈 배열을 반환한다", async () => {
    const results = await mapConcurrent([], async (n: number) => n, 3);
    expect(results).toEqual([]);
  });

  it("concurrency가 배열 길이보다 크면 전부 동시 실행한다", async () => {
    const results = await mapConcurrent([1, 2, 3], async (n) => n * 2, 10);
    expect(results).toEqual([2, 4, 6]);
  });

  it("fn이 reject되면 전체가 reject된다", async () => {
    const fn = async (n: number) => {
      if (n === 3) throw new Error("failed at 3");
      return n;
    };

    await expect(mapConcurrent([1, 2, 3, 4], fn, 2)).rejects.toThrow("failed at 3");
  });

  it("concurrency가 0 이하이면 에러를 던진다", async () => {
    await expect(mapConcurrent([1, 2], async (n) => n, 0)).rejects.toThrow(
      "concurrency must be greater than 0",
    );
    await expect(mapConcurrent([1, 2], async (n) => n, -1)).rejects.toThrow(
      "concurrency must be greater than 0",
    );
  });
});
