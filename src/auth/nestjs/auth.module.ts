import { Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import type { SignTokenOptions } from "../auth.options";
import { AUTH_OPTIONS } from "./auth.constants";

/**
 * @description `JwtAuthGuard`가 토큰 검증에 쓸 `SignTokenOptions`(secret/expiresIn)를
 * `AUTH_OPTIONS` 토큰으로 등록하는 동적 모듈. `HttpModule`과 동일하게 `@Global()`이 아니므로
 * 사용할 모듈에서 직접 import한다.
 */
@Module({})
export class JwtAuthModule {
  static forRoot(options: SignTokenOptions): DynamicModule {
    return {
      module: JwtAuthModule,
      providers: [{ provide: AUTH_OPTIONS, useValue: options }],
      exports: [AUTH_OPTIONS],
    };
  }
}
