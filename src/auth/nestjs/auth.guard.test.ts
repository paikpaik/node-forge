import { describe, it, expect } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import { JwtAuthGuard } from "./auth.guard";
import { signToken } from "../auth";
import type { AuthedRequest } from "./auth.types";

const OPTIONS = { secret: "s3cr3t", expiresIn: "15m" };

function makeContext(request: AuthedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe("JwtAuthGuard", () => {
  const guard = new JwtAuthGuard(OPTIONS);

  it("유효한 Bearer 토큰이면 통과시키고 request.user를 채운다", () => {
    const token = signToken({ sub: "user-1", role: "customer" }, OPTIONS);
    const request: AuthedRequest = { headers: { authorization: `Bearer ${token}` } };

    expect(guard.canActivate(makeContext(request))).toBe(true);
    expect(request.user).toEqual(expect.objectContaining({ sub: "user-1", role: "customer" }));
  });

  it("Authorization 헤더가 없으면 UnauthorizedException을 던진다", () => {
    const request: AuthedRequest = { headers: {} };

    expect(() => guard.canActivate(makeContext(request))).toThrow(UnauthorizedException);
  });

  it("변조되었거나 다른 secret으로 서명된 토큰은 UnauthorizedException을 던진다", () => {
    const token = signToken({ sub: "user-1" }, { secret: "other-secret", expiresIn: "15m" });
    const request: AuthedRequest = { headers: { authorization: `Bearer ${token}` } };

    expect(() => guard.canActivate(makeContext(request))).toThrow(UnauthorizedException);
  });
});
