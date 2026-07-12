import { describe, it, expect, vi } from "vitest";
import { ForgeExceptionFilter } from "./response.filter";
import { ForgeBizError, ForgeHttpError } from "../../core/errors";

function createHost() {
  const response = {};
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  };
  return { host, response };
}

describe("ForgeExceptionFilter", () => {
  it("ForgeHttpError는 exception의 statusCode로 응답한다", () => {
    const reply = vi.fn();
    const httpAdapterHost = { httpAdapter: { reply } };
    const filter = new ForgeExceptionFilter(httpAdapterHost as never);
    const { host, response } = createHost();
    const exception = new ForgeHttpError(404, "E9404", "not found");

    filter.catch(exception, host as never);

    expect(reply).toHaveBeenCalledWith(
      response,
      { success: false, error: { code: "E9404", message: "not found" } },
      404,
    );
  });

  it("ForgeBizError는 400으로 응답한다", () => {
    const reply = vi.fn();
    const httpAdapterHost = { httpAdapter: { reply } };
    const filter = new ForgeExceptionFilter(httpAdapterHost as never);
    const { host, response } = createHost();
    const exception = new ForgeBizError("E9401", "already processed");

    filter.catch(exception, host as never);

    expect(reply).toHaveBeenCalledWith(
      response,
      { success: false, error: { code: "E9401", message: "already processed" } },
      400,
    );
  });
});
