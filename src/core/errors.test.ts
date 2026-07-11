import { describe, it, expect } from "vitest";
import { ForgeError, ForgeHttpError, ForgeBizError } from "./errors";
import { ErrorCode } from "./types";

describe("ForgeError", () => {
  it("message와 code를 올바르게 저장한다", () => {
    const err = new ForgeError(ErrorCode.INTERNAL_ERROR, "서버 오류");
    expect(err.message).toBe("서버 오류");
    expect(err.code).toBe("E9500");
    expect(err.name).toBe("ForgeError");
  });

  it("instanceof 체크가 정상 동작한다", () => {
    const err = new ForgeError(ErrorCode.NOT_FOUND, "없음");
    expect(err instanceof ForgeError).toBe(true);
    expect(err instanceof Error).toBe(true);
  });

  it("cause를 저장한다", () => {
    const cause = new Error("원인");
    const err = new ForgeError(ErrorCode.INTERNAL_ERROR, "래핑 오류", cause);
    expect(err.cause).toBe(cause);
  });
});

describe("ForgeHttpError", () => {
  it("statusCode를 올바르게 저장한다", () => {
    const err = new ForgeHttpError(404, ErrorCode.NOT_FOUND, "리소스 없음");
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("E9404");
    expect(err.name).toBe("ForgeHttpError");
  });

  it("ForgeError의 instanceof를 만족한다", () => {
    const err = new ForgeHttpError(401, ErrorCode.UNAUTHORIZED, "인증 필요");
    expect(err instanceof ForgeHttpError).toBe(true);
    expect(err instanceof ForgeError).toBe(true);
  });
});

describe("ForgeBizError", () => {
  it("비즈니스 에러를 올바르게 저장한다", () => {
    const err = new ForgeBizError(ErrorCode.CONFLICT, "이미 존재합니다");
    expect(err.code).toBe("E9409");
    expect(err.name).toBe("ForgeBizError");
  });

  it("ForgeError의 instanceof를 만족한다", () => {
    const err = new ForgeBizError(ErrorCode.FORBIDDEN, "권한 없음");
    expect(err instanceof ForgeBizError).toBe(true);
    expect(err instanceof ForgeError).toBe(true);
  });
});
