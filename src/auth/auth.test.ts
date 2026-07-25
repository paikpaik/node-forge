import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import { signToken, verifyToken } from "./auth";

describe("signToken", () => {
  it("표준 JWT 구조로 서명하고 지정한 클레임을 그대로 담는다", () => {
    const token = signToken({ sub: "user-1", role: "customer" }, { secret: "s3cr3t", expiresIn: "15m" });

    expect(token.split(".")).toHaveLength(3);
    const decoded = jwt.decode(token) as { sub: string; role: string };
    expect(decoded.sub).toBe("user-1");
    expect(decoded.role).toBe("customer");
  });
});

describe("verifyToken", () => {
  it("발급한 토큰을 같은 secret으로 검증하면 클레임을 반환한다", () => {
    const token = signToken({ sub: "user-1", role: "customer" }, { secret: "s3cr3t", expiresIn: "15m" });

    const claims = verifyToken<{ sub: string; role: string }>(token, "s3cr3t");
    expect(claims).toEqual(expect.objectContaining({ sub: "user-1", role: "customer" }));
  });

  it("다른 secret으로 서명된 토큰은 거부한다", () => {
    const token = signToken({ sub: "user-1" }, { secret: "s3cr3t", expiresIn: "15m" });

    expect(verifyToken(token, "wrong-secret")).toBeNull();
  });

  it("payload를 변조(서명은 원본 그대로)하면 검증에 실패한다", () => {
    const token = signToken({ sub: "user-1", role: "customer" }, { secret: "s3cr3t", expiresIn: "15m" });
    const [header, , signature] = token.split(".");
    const tamperedPayload = Buffer.from(JSON.stringify({ sub: "user-1", role: "admin" })).toString(
      "base64url",
    );
    const tamperedToken = `${header}.${tamperedPayload}.${signature}`;

    expect(verifyToken(tamperedToken, "s3cr3t")).toBeNull();
  });

  it("만료된 토큰은 검증에 실패한다", async () => {
    const token = signToken({ sub: "user-1" }, { secret: "s3cr3t", expiresIn: "1ms" });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(verifyToken(token, "s3cr3t")).toBeNull();
  });

  it("형식이 손상된 토큰은 검증에 실패한다", () => {
    expect(verifyToken("not-a-jwt", "s3cr3t")).toBeNull();
  });
});
