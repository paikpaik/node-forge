import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { verifyToken } from "../auth";
import type { SignTokenOptions } from "../auth.options";
import { AUTH_OPTIONS } from "./auth.constants";
import type { AuthedRequest } from "./auth.types";

function extractBearerToken(header?: string): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  return scheme === "Bearer" && token ? token : null;
}

/**
 * @description `Authorization: Bearer <token>` 헤더를 꺼내 `verifyToken`으로 검증하고,
 * 성공하면 클레임을 `request.user`에 채운다. 토큰이 없거나 검증에 실패하면
 * `UnauthorizedException`(401)을 던진다 — role 불일치로 인한 403은 `RolesGuard`의 책임이다.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(AUTH_OPTIONS) private readonly options: SignTokenOptions) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const token = extractBearerToken(request.headers.authorization);
    const claims = token ? verifyToken(token, this.options.secret) : null;

    if (!claims) {
      throw new UnauthorizedException();
    }

    request.user = claims;
    return true;
  }
}
