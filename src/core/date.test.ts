import { describe, it, expect } from "vitest";
import {
  parseDate,
  isExpired,
  toStartOfDay,
  toEndOfDay,
  daysBetween,
  toDateString,
  toDateTimeString,
} from "./date";

describe("parseDate", () => {
  it("유효한 ISO 문자열을 파싱한다", () => {
    const result = parseDate("2026-06-13T12:00:00.000Z");
    expect(result).toBeInstanceOf(Date);
    expect(result?.toISOString()).toBe("2026-06-13T12:00:00.000Z");
  });

  it("날짜만 있는 문자열을 파싱한다", () => {
    const result = parseDate("2026-06-13");
    expect(result).toBeInstanceOf(Date);
    expect(result).not.toBeNull();
  });

  it("유효한 Date 인스턴스는 그대로 반환한다", () => {
    const d = new Date("2026-06-13T12:00:00.000Z");
    expect(parseDate(d)).toBe(d);
  });

  it("Invalid Date 인스턴스이면 null을 반환한다", () => {
    expect(parseDate(new Date("invalid"))).toBeNull();
  });

  it("잘못된 문자열이면 null을 반환한다", () => {
    expect(parseDate("not-a-date")).toBeNull();
    expect(parseDate("abc")).toBeNull();
  });

  it("빈 문자열이면 null을 반환한다", () => {
    expect(parseDate("")).toBeNull();
  });

  it("null이면 null을 반환한다", () => {
    expect(parseDate(null)).toBeNull();
  });

  it("undefined이면 null을 반환한다", () => {
    expect(parseDate(undefined)).toBeNull();
  });

  it("숫자(타임스탬프)이면 null을 반환한다", () => {
    expect(parseDate(1718280000000)).toBeNull();
  });
});

describe("isExpired", () => {
  it("TTL이 경과하지 않았으면 false를 반환한다", () => {
    const recent = new Date(Date.now() - 100); // 100ms 전
    expect(isExpired(recent, 3_600_000)).toBe(false);
  });

  it("TTL이 경과했으면 true를 반환한다", () => {
    const old = new Date(Date.now() - 7_200_000); // 2시간 전
    expect(isExpired(old, 3_600_000)).toBe(true);
  });

  it("TTL이 0ms이면 항상 만료 처리된다", () => {
    const d = new Date(Date.now() - 1);
    expect(isExpired(d, 0)).toBe(true);
  });
});

describe("toStartOfDay", () => {
  it("시각을 00:00:00.000으로 맞춘다", () => {
    const d = new Date();
    const start = toStartOfDay(d);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);
  });

  it("날짜(년/월/일)는 유지된다", () => {
    const d = new Date(2026, 5, 13, 15, 30, 0); // 2026-06-13 15:30 (로컬)
    const start = toStartOfDay(d);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(5);
    expect(start.getDate()).toBe(13);
  });

  it("원본 date를 변경하지 않는다", () => {
    const d = new Date(2026, 5, 13, 15, 30, 0);
    const original = d.getTime();
    toStartOfDay(d);
    expect(d.getTime()).toBe(original);
  });
});

describe("toEndOfDay", () => {
  it("시각을 23:59:59.999로 맞춘다", () => {
    const d = new Date();
    const end = toEndOfDay(d);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
    expect(end.getMilliseconds()).toBe(999);
  });

  it("날짜(년/월/일)는 유지된다", () => {
    const d = new Date(2026, 5, 13, 8, 0, 0); // 2026-06-13 08:00 (로컬)
    const end = toEndOfDay(d);
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(5);
    expect(end.getDate()).toBe(13);
  });

  it("원본 date를 변경하지 않는다", () => {
    const d = new Date(2026, 5, 13, 8, 0, 0);
    const original = d.getTime();
    toEndOfDay(d);
    expect(d.getTime()).toBe(original);
  });
});

describe("daysBetween", () => {
  it("같은 날이면 0을 반환한다", () => {
    const a = new Date("2026-06-13T12:00:00.000Z");
    const b = new Date("2026-06-13T18:00:00.000Z");
    expect(daysBetween(a, b)).toBe(0);
  });

  it("1일 차이를 계산한다", () => {
    const a = new Date("2026-06-13T12:00:00.000Z");
    const b = new Date("2026-06-14T12:00:00.000Z");
    expect(daysBetween(a, b)).toBe(1);
  });

  it("7일 차이를 계산한다", () => {
    const a = new Date("2026-06-01T12:00:00.000Z");
    const b = new Date("2026-06-08T12:00:00.000Z");
    expect(daysBetween(a, b)).toBe(7);
  });

  it("순서가 바뀌어도 같은 값을 반환한다", () => {
    const a = new Date("2026-06-01T12:00:00.000Z");
    const b = new Date("2026-06-08T12:00:00.000Z");
    expect(daysBetween(a, b)).toBe(daysBetween(b, a));
  });
});

describe("toDateString", () => {
  it("UTC 기준 'YYYY-MM-DD' 형식을 반환한다", () => {
    const d = new Date("2026-06-13T12:00:00.000Z");
    expect(toDateString(d)).toBe("2026-06-13");
  });

  it("형식이 정확히 10자리다", () => {
    const d = new Date("2026-01-05T00:00:00.000Z");
    const result = toDateString(d);
    expect(result).toHaveLength(10);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("toDateTimeString", () => {
  it("UTC 기준 'YYYY-MM-DDTHH:mm:ss' 형식을 반환한다", () => {
    const d = new Date("2026-06-13T17:54:03.000Z");
    expect(toDateTimeString(d)).toBe("2026-06-13T17:54:03");
  });

  it("형식이 정확히 19자리다", () => {
    const d = new Date("2026-01-05T09:05:07.000Z");
    const result = toDateTimeString(d);
    expect(result).toHaveLength(19);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });
});
