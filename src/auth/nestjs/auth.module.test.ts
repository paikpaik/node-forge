import { describe, it, expect } from "vitest";
import { JwtAuthModule } from "./auth.module";
import { AUTH_OPTIONS } from "./auth.constants";

describe("JwtAuthModule.forRoot", () => {
  it("SignTokenOptions를 AUTH_OPTIONS 프로바이더로 등록한 DynamicModule을 반환한다", () => {
    const options = { secret: "s3cr3t", expiresIn: "15m" };

    const dynamicModule = JwtAuthModule.forRoot(options);

    expect(dynamicModule.module).toBe(JwtAuthModule);
    expect(dynamicModule.providers).toEqual([{ provide: AUTH_OPTIONS, useValue: options }]);
    expect(dynamicModule.exports).toEqual([AUTH_OPTIONS]);
  });
});
