import { describe, it, expect, vi } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { RolesGuard } from "./roles.guard";
import type { AuthedRequest } from "./auth.types";

function makeContext(role: string | undefined): ExecutionContext {
  const request: AuthedRequest<{ role?: string }> = { headers: {}, user: { role } };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => vi.fn(),
    getClass: () => vi.fn(),
  } as unknown as ExecutionContext;
}

function makeReflector(requiredRoles: string[] | undefined): Reflector {
  return { getAllAndOverride: () => requiredRoles } as unknown as Reflector;
}

describe("RolesGuard", () => {
  it("@Roles() 메타데이터가 없으면 통과시킨다", () => {
    const guard = new RolesGuard(makeReflector(undefined));
    expect(guard.canActivate(makeContext("customer"))).toBe(true);
  });

  it("user.role이 허용 목록에 있으면 통과시킨다", () => {
    const guard = new RolesGuard(makeReflector(["admin"]));
    expect(guard.canActivate(makeContext("admin"))).toBe(true);
  });

  it("user.role이 허용 목록에 없으면 거부한다", () => {
    const guard = new RolesGuard(makeReflector(["admin"]));
    expect(guard.canActivate(makeContext("customer"))).toBe(false);
  });

  it("user가 없으면 거부한다", () => {
    const guard = new RolesGuard(makeReflector(["admin"]));
    expect(guard.canActivate(makeContext(undefined))).toBe(false);
  });
});
