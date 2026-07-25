import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * @description 빌드 산출물을 실제 소비자처럼 설치해서 require()/import() 서브패스 로딩과
 * 크로스 엔트리 instanceof(@Catch 매칭)를 검증한다. `vitest`는 소스를 직접 테스트하므로
 * tsup 번들링/exports 맵 설정 오류(예: exports 확장자 불일치, splitting: false로 인한
 * 클래스 중복)는 잡지 못한다 — 두 번 실제로 겪은 문제라 배포 전 CI 게이트로 둔다.
 */
const root = process.cwd();
const workDir = mkdtempSync(join(tmpdir(), "node-forge-smoke-"));

try {
  const tarballName = execFileSync("npm", ["pack", "--pack-destination", workDir, "--silent"], {
    cwd: root,
  })
    .toString()
    .trim();
  const tarballPath = join(workDir, tarballName);

  const consumerDir = join(workDir, "consumer");
  mkdirSync(consumerDir);
  writeFileSync(join(consumerDir, "package.json"), JSON.stringify({ name: "smoke-consumer", version: "0.0.0", private: true }));

  execFileSync(
    "npm",
    [
      "install",
      tarballPath,
      "@nestjs/common@^10",
      "@nestjs/core@^10",
      "@nestjs/microservices@^10",
      "rxjs@^7",
      "reflect-metadata@^0.2",
      "--no-save",
      "--silent",
    ],
    { cwd: consumerDir, stdio: "inherit" },
  );

  writeFileSync(
    join(consumerDir, "check.cjs"),
    `
require("reflect-metadata");
const assert = require("node:assert/strict");
const { Reflector } = require("@nestjs/core");

const core = require("@paikpaik/node-forge/core");
const responseNestjs = require("@paikpaik/node-forge/response/nestjs");
const healthNestjs = require("@paikpaik/node-forge/health/nestjs");
const authNestjs = require("@paikpaik/node-forge/auth/nestjs");
const grpcNestjs = require("@paikpaik/node-forge/grpc/nestjs");
assert.ok(core.ForgeBizError, "core: require()로 ForgeBizError 로드 실패");
assert.ok(responseNestjs.ForgeExceptionFilter, "response/nestjs: require()로 ForgeExceptionFilter 로드 실패");
assert.ok(healthNestjs.HealthModule, "health/nestjs: require()로 HealthModule 로드 실패");
assert.ok(authNestjs.JwtAuthGuard, "auth/nestjs: require()로 JwtAuthGuard 로드 실패");
assert.ok(authNestjs.RolesGuard, "auth/nestjs: require()로 RolesGuard 로드 실패");
assert.ok(grpcNestjs.createGrpcClientOptions, "grpc/nestjs: require()로 createGrpcClientOptions 로드 실패");

const err = new core.ForgeBizError("E9409", "smoke");
const catchTargets = Reflect.getMetadata("__filterCatchExceptions__", responseNestjs.ForgeExceptionFilter);
assert.ok(
  catchTargets.some((C) => err instanceof C),
  "core에서 만든 ForgeBizError가 response/nestjs의 @Catch 대상과 매칭되지 않음 (엔트리 간 클래스 중복 번들링 의심)",
);

// esbuild(tsup)는 emitDecoratorMetadata의 design:paramtypes를 방출하지 않는다. 타입 추론에만
// 의존하는 생성자는 소스 레벨 테스트를 통과해도 배포된 dist에서 Nest DI가 무엇을 주입할지 몰라
// undefined가 주입된다(20260725 RolesGuard 버그) — self:paramtypes(@Inject 명시)로 실제
// 주입 대상 토큰이 dist에 살아있는지 여기서 직접 확인한다.
const selfDeps = Reflect.getMetadata("self:paramtypes", authNestjs.RolesGuard) ?? [];
assert.ok(
  selfDeps.some((dep) => dep.index === 0 && dep.param === Reflector),
  "auth/nestjs: RolesGuard 생성자의 0번 파라미터에 @Inject(Reflector) 메타데이터가 없음 (dist에서 DI 실패 재현)",
);

console.log("[smoke-test] require() 서브패스 로딩 + 크로스 엔트리 instanceof + DI 메타데이터 검증 통과");
`,
  );
  execFileSync("node", ["check.cjs"], { cwd: consumerDir, stdio: "inherit" });

  writeFileSync(
    join(consumerDir, "check.mjs"),
    `
import { ForgeExceptionFilter } from "@paikpaik/node-forge/response/nestjs";
if (!ForgeExceptionFilter) throw new Error("response/nestjs: import()로 ForgeExceptionFilter 로드 실패");
console.log("[smoke-test] import() 서브패스 로딩 검증 통과");
`,
  );
  execFileSync("node", ["check.mjs"], { cwd: consumerDir, stdio: "inherit" });

  writeFileSync(
    join(consumerDir, "check-events-boot.cjs"),
    `
require("reflect-metadata");
const { NestFactory } = require("@nestjs/core");
const { EventsModule } = require("@paikpaik/node-forge/events/nestjs");

// EventsExplorer(내부 provider, public export 아님)는 discovery/scanner/reflector를
// 생성자에서 주입받아 onApplicationBootstrap 시점에 바로 사용한다. 이 셋 중 하나라도
// @Inject() 없이 타입 추론에만 의존하면(20260725 RolesGuard와 같은 원인) esbuild(tsup)
// dist에서 undefined가 주입되어 여기서 즉시 TypeError로 죽는다 — 실제 부팅으로만 드러난다.
(async () => {
  const app = await NestFactory.createApplicationContext(EventsModule, { logger: false });
  await app.close();
  console.log("[smoke-test] EventsModule 부팅 + EventsExplorer DI 해결 검증 통과");
})().catch((err) => {
  console.error("[smoke-test] EventsModule 부팅 실패:", err);
  process.exit(1);
});
`,
  );
  execFileSync("node", ["check-events-boot.cjs"], { cwd: consumerDir, stdio: "inherit" });
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
