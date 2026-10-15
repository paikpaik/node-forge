import { describe, it, expect, vi, afterEach } from "vitest";
import {
  BadRequestException,
  HttpException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { firstValueFrom } from "rxjs";
import type { Observable } from "rxjs";
import {
  ForgeAllExceptionsFilter,
  httpStatusToErrorCode,
  isExpectedException,
  toErrorReply,
} from "./all-exceptions.filter";
import { ForgeBizError, ForgeHttpError } from "../../core/errors";

function createFilter() {
  const reply = vi.fn();
  const filter = new ForgeAllExceptionsFilter({ httpAdapter: { reply } } as never);
  const response = {};
  const host = { getType: () => "http", switchToHttp: () => ({ getResponse: () => response }) };
  return { filter, reply, response, host };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("httpStatusToErrorCode", () => {
  it("4xx·5xx는 E9 + 상태 코드", () => {
    expect(httpStatusToErrorCode(404)).toBe("E9404");
    expect(httpStatusToErrorCode(503)).toBe("E9503");
  });

  it("4xx·5xx가 아니면 E9500", () => {
    expect(httpStatusToErrorCode(200)).toBe("E9500");
    expect(httpStatusToErrorCode(302)).toBe("E9500");
    expect(httpStatusToErrorCode(Number.NaN)).toBe("E9500");
  });
});

describe("toErrorReply", () => {
  it("ForgeHttpError는 자신의 statusCode와 code를 쓴다", () => {
    expect(toErrorReply(new ForgeHttpError(409, "E9409", "conflict"))).toEqual({
      statusCode: 409,
      body: { success: false, error: { code: "E9409", message: "conflict" } },
    });
  });

  it("ForgeBizError는 400", () => {
    expect(toErrorReply(new ForgeBizError("E9401", "already processed")).statusCode).toBe(400);
  });

  it("Nest HttpException은 상태 코드를 유지하고 코드를 매핑한다", () => {
    expect(toErrorReply(new NotFoundException("Cannot GET /nope"))).toEqual({
      statusCode: 404,
      body: { success: false, error: { code: "E9404", message: "Cannot GET /nope" } },
    });
  });

  it("ValidationPipe처럼 message가 배열이면 한 줄로 합친다", () => {
    const exception = new BadRequestException(["name must be a string", "age must be a number"]);

    expect(toErrorReply(exception).body.error).toEqual({
      code: "E9400",
      message: "name must be a string, age must be a number",
    });
  });

  it("응답 본문이 message 없는 객체면 예외 message를 쓴다", () => {
    const exception = new ServiceUnavailableException({ status: "error", checks: [] });

    expect(toErrorReply(exception)).toMatchObject({
      statusCode: 503,
      body: { error: { code: "E9503" } },
    });
  });

  it("문자열 응답 본문은 그대로 메시지로 쓴다", () => {
    expect(toErrorReply(new HttpException("teapot", 418)).body.error).toEqual({
      code: "E9418",
      message: "teapot",
    });
  });

  it("4xx·5xx가 아닌 상태의 HttpException은 code와 맞춰 500으로 응답한다", () => {
    expect(toErrorReply(new HttpException("moved", 302))).toEqual({
      statusCode: 500,
      body: { success: false, error: { code: "E9500", message: "moved" } },
    });
  });

  it("예상하지 못한 예외는 500 E9500이고 내부 메시지를 노출하지 않는다", () => {
    expect(toErrorReply(new Error("ER_DUP_ENTRY: secret sql"))).toEqual({
      statusCode: 500,
      body: { success: false, error: { code: "E9500", message: "Internal server error" } },
    });
  });
});

describe("ForgeAllExceptionsFilter", () => {
  it("변환한 응답을 httpAdapter.reply로 보낸다", () => {
    const { filter, reply, response, host } = createFilter();

    filter.catch(new NotFoundException("missing"), host as never);

    expect(reply).toHaveBeenCalledWith(
      response,
      { success: false, error: { code: "E9404", message: "missing" } },
      404,
    );
  });

  it("예상하지 못한 예외만 에러 로그를 남긴다", () => {
    const logError = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const { filter, host } = createFilter();

    filter.catch(new NotFoundException(), host as never);
    filter.catch(new ForgeBizError("E9401", "biz"), host as never);
    expect(logError).not.toHaveBeenCalled();

    filter.catch(new Error("boom"), host as never);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls[0][0]).toContain("boom");
  });

  it("의도된 예외라도 5xx면 응답에서 빠진 상세를 warn으로 남긴다", () => {
    const logWarn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const { filter, host } = createFilter();

    filter.catch(new NotFoundException(), host as never);
    expect(logWarn).not.toHaveBeenCalled();

    filter.catch(
      new ServiceUnavailableException({
        status: "error",
        checks: [{ name: "redis", status: "down" }],
      }),
      host as never,
    );
    expect(logWarn.mock.calls[0][0]).toContain("E9503");
    expect(logWarn.mock.calls[0][0]).toContain("redis");

    filter.catch(
      new ForgeHttpError(502, "E9502", "upstream failed", new Error("ECONNRESET")),
      host as never,
    );
    expect(logWarn.mock.calls[1][0]).toContain("ECONNRESET");
  });

  it("HTTP가 아닌 컨텍스트에서는 응답하지 않고 예외를 그대로 전달한다", async () => {
    const { filter, reply } = createFilter();
    const rpcHost = { getType: () => "rpc" };
    const exception = new ForgeBizError("E9401", "biz");

    const result = filter.catch(exception, rpcHost as never) as Observable<never>;

    expect(reply).not.toHaveBeenCalled();
    await expect(firstValueFrom(result)).rejects.toBe(exception);
  });
});

describe("isExpectedException", () => {
  it("Forge 에러와 HttpException만 의도된 예외로 본다", () => {
    expect(isExpectedException(new ForgeHttpError(500, "E9500", "x"))).toBe(true);
    expect(isExpectedException(new ForgeBizError("E9400", "x"))).toBe(true);
    expect(isExpectedException(new NotFoundException())).toBe(true);
    expect(isExpectedException(new Error("x"))).toBe(false);
    expect(isExpectedException("string")).toBe(false);
  });
});
