import { describe, it, expect } from "vitest";
import {
  isNonNull,
  isString,
  isNumber,
  isBoolean,
  isObject,
  isArray,
  safeJsonParse,
} from "./type-guards";

describe("isNonNull", () => {
  it("null이면 false를 반환한다", () => {
    expect(isNonNull(null)).toBe(false);
  });

  it("undefined이면 false를 반환한다", () => {
    expect(isNonNull(undefined)).toBe(false);
  });

  it("0, 빈 문자열, false는 true를 반환한다", () => {
    expect(isNonNull(0)).toBe(true);
    expect(isNonNull("")).toBe(true);
    expect(isNonNull(false)).toBe(true);
  });

  it("일반 값이면 true를 반환한다", () => {
    expect(isNonNull(1)).toBe(true);
    expect(isNonNull("hello")).toBe(true);
    expect(isNonNull({})).toBe(true);
  });

  it("배열 filter와 함께 쓰면 null/undefined를 제거한다", () => {
    const arr: (number | null | undefined)[] = [1, null, 2, undefined, 3];
    const result: number[] = arr.filter(isNonNull);
    expect(result).toEqual([1, 2, 3]);
  });
});

describe("isString", () => {
  it("문자열이면 true를 반환한다", () => {
    expect(isString("")).toBe(true);
    expect(isString("hello")).toBe(true);
  });

  it("문자열이 아니면 false를 반환한다", () => {
    expect(isString(1)).toBe(false);
    expect(isString(null)).toBe(false);
    expect(isString(undefined)).toBe(false);
    expect(isString([])).toBe(false);
  });
});

describe("isNumber", () => {
  it("숫자이면 true를 반환한다", () => {
    expect(isNumber(0)).toBe(true);
    expect(isNumber(42)).toBe(true);
    expect(isNumber(NaN)).toBe(true);
  });

  it("숫자가 아니면 false를 반환한다", () => {
    expect(isNumber("1")).toBe(false);
    expect(isNumber(null)).toBe(false);
    expect(isNumber(undefined)).toBe(false);
  });
});

describe("isBoolean", () => {
  it("true/false이면 true를 반환한다", () => {
    expect(isBoolean(true)).toBe(true);
    expect(isBoolean(false)).toBe(true);
  });

  it("boolean이 아니면 false를 반환한다", () => {
    expect(isBoolean(0)).toBe(false);
    expect(isBoolean("")).toBe(false);
    expect(isBoolean(null)).toBe(false);
  });
});

describe("isObject", () => {
  it("순수 객체이면 true를 반환한다", () => {
    expect(isObject({})).toBe(true);
    expect(isObject({ a: 1 })).toBe(true);
  });

  it("null은 false를 반환한다", () => {
    expect(isObject(null)).toBe(false);
  });

  it("배열은 false를 반환한다", () => {
    expect(isObject([])).toBe(false);
    expect(isObject([1, 2])).toBe(false);
  });

  it("원시값은 false를 반환한다", () => {
    expect(isObject(1)).toBe(false);
    expect(isObject("str")).toBe(false);
    expect(isObject(true)).toBe(false);
  });
});

describe("isArray", () => {
  it("배열이면 true를 반환한다", () => {
    expect(isArray([])).toBe(true);
    expect(isArray([1, 2, 3])).toBe(true);
  });

  it("배열이 아니면 false를 반환한다", () => {
    expect(isArray({})).toBe(false);
    expect(isArray("string")).toBe(false);
    expect(isArray(null)).toBe(false);
  });
});

describe("safeJsonParse", () => {
  it("유효한 JSON 문자열을 파싱한다", () => {
    expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 });
    expect(safeJsonParse("[1,2,3]")).toEqual([1, 2, 3]);
    expect(safeJsonParse('"hello"')).toBe("hello");
  });

  it("유효하지 않은 JSON이면 null을 반환한다", () => {
    expect(safeJsonParse("invalid")).toBeNull();
    expect(safeJsonParse("{broken")).toBeNull();
    expect(safeJsonParse("")).toBeNull();
  });

  it("제네릭 타입으로 반환 타입을 지정할 수 있다", () => {
    const result = safeJsonParse<{ id: number }>('{"id":42}');
    expect(result?.id).toBe(42);
  });
});
