import { describe, it, expect } from "vitest";
import { Roles } from "./roles.decorator";
import { ROLES_KEY } from "./auth.constants";

describe("Roles", () => {
  it("메서드에 허용 role 목록을 메타데이터로 붙인다", () => {
    class TestController {
      @Roles("admin", "customer")
      handler() {}
    }

    expect(Reflect.getMetadata(ROLES_KEY, TestController.prototype.handler)).toEqual([
      "admin",
      "customer",
    ]);
  });
});
