import { describe, it, expect } from "vitest";
import { ROUTE_ARGS_METADATA } from "@nestjs/common/constants";
import type { ExecutionContext } from "@nestjs/common";
import { ApiVersion } from "./versioning.decorator";
import type { VersionOptions } from "../versioning";

function getFactory() {
  class TestController {
    handler(@ApiVersion({ defaultVersion: "v2" }) _version: unknown) {}
  }
  const metadata = Reflect.getMetadata(ROUTE_ARGS_METADATA, TestController, "handler");
  const entry = metadata[Object.keys(metadata)[0]];
  return entry.factory as (options: VersionOptions, ctx: ExecutionContext) => unknown;
}

function mockContext(headers: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

describe("ApiVersion", () => {
  const factory = getFactory();

  it("Accept-Version 헤더를 읽어 협상 결과를 반환한다", () => {
    const ctx = mockContext({ "accept-version": "v1" });
    expect(factory({ defaultVersion: "v2", supportedVersions: ["v1", "v2"] }, ctx)).toEqual({
      requested: "v1",
      resolved: "v1",
      isFallback: false,
    });
  });

  it("헤더가 없으면 defaultVersion으로 폴백한 결과를 반환한다", () => {
    const ctx = mockContext({});
    expect(factory({ defaultVersion: "v2" }, ctx)).toEqual({
      requested: null,
      resolved: "v2",
      isFallback: true,
    });
  });

  it("options.headerName으로 다른 헤더명을 지정할 수 있다", () => {
    const ctx = mockContext({ "x-api-version": "v1" });
    expect(
      factory(
        { defaultVersion: "v2", supportedVersions: ["v1", "v2"], headerName: "x-api-version" },
        ctx,
      ),
    ).toEqual({ requested: "v1", resolved: "v1", isFallback: false });
  });

  it("지원하지 않는 버전을 요청하면 defaultVersion으로 폴백한다", () => {
    const ctx = mockContext({ "accept-version": "v9" });
    expect(factory({ defaultVersion: "v2", supportedVersions: ["v1", "v2"] }, ctx)).toEqual({
      requested: "v9",
      resolved: "v2",
      isFallback: true,
    });
  });
});
