import { describe, it, expect } from "vitest";
import { resolveVersion, DEFAULT_HEADER_NAME } from "./versioning";

describe("resolveVersion", () => {
  it("헤더가 없으면 defaultVersion으로 폴백한다", () => {
    expect(resolveVersion(undefined, { defaultVersion: "v2" })).toEqual({
      requested: null,
      resolved: "v2",
      isFallback: true,
    });
  });

  it("헤더가 null이면 defaultVersion으로 폴백한다", () => {
    expect(resolveVersion(null, { defaultVersion: "v2" })).toEqual({
      requested: null,
      resolved: "v2",
      isFallback: true,
    });
  });

  it("supportedVersions가 없으면 요청 버전을 그대로 사용한다", () => {
    expect(resolveVersion("v3", { defaultVersion: "v2" })).toEqual({
      requested: "v3",
      resolved: "v3",
      isFallback: false,
    });
  });

  it("요청 버전이 supportedVersions에 있으면 그대로 사용한다", () => {
    expect(resolveVersion("v1", { defaultVersion: "v2", supportedVersions: ["v1", "v2"] })).toEqual(
      { requested: "v1", resolved: "v1", isFallback: false },
    );
  });

  it("요청 버전이 supportedVersions에 없으면 defaultVersion으로 폴백한다", () => {
    expect(resolveVersion("v9", { defaultVersion: "v2", supportedVersions: ["v1", "v2"] })).toEqual(
      { requested: "v9", resolved: "v2", isFallback: true },
    );
  });

  it("중복 헤더로 배열이 들어오면 첫 번째 값을 사용한다", () => {
    expect(
      resolveVersion(["v1", "v2"], { defaultVersion: "v2", supportedVersions: ["v1", "v2"] }),
    ).toEqual({ requested: "v1", resolved: "v1", isFallback: false });
  });

  it("빈 배열이 들어오면 헤더가 없는 것으로 처리한다", () => {
    expect(resolveVersion([], { defaultVersion: "v2" })).toEqual({
      requested: null,
      resolved: "v2",
      isFallback: true,
    });
  });

  it("DEFAULT_HEADER_NAME은 accept-version이다", () => {
    expect(DEFAULT_HEADER_NAME).toBe("accept-version");
  });
});
