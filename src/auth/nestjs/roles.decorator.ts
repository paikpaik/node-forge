import { SetMetadata } from "@nestjs/common";
import { ROLES_KEY } from "./auth.constants";

/**
 * @description 핸들러/컨트롤러에 허용 role 목록을 메타데이터로 붙인다. `RolesGuard`가 이
 * 메타데이터를 읽어 `request.user.role`과 비교한다. 붙이지 않으면 `RolesGuard`는 통과시킨다.
 */
export const Roles = (...roles: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
