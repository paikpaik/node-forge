import { Inject, Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "./auth.constants";
import type { AuthedRequest } from "./auth.types";

/**
 * @description `@Roles()`로 지정된 허용 role과 `request.user.role`(반드시 `JwtAuthGuard` 뒤에
 * 실행되어야 채워짐)을 비교한다. `@Roles()`가 없는 라우트는 그대로 통과시키고, 있는데
 * role이 없거나 목록에 없으면 거부한다(Nest가 자동으로 403 Forbidden으로 응답한다).
 * `@Inject(Reflector)`를 명시하는 이유: node-forge는 esbuild(tsup)로 빌드되는데 esbuild는
 * `emitDecoratorMetadata`가 만드는 `design:paramtypes`를 방출하지 않는다 — 타입 추론에만
 * 의존하면 소스에서는 멀쩡해도 배포된 dist에서 Nest DI가 무엇을 주입할지 몰라 런타임에
 * `undefined`가 주입된다.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest<{ role?: string }>>();
    const role = request.user?.role;
    return !!role && requiredRoles.includes(role);
  }
}
