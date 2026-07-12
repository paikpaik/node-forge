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

const core = require("@paikpaik/node-forge/core");
const responseNestjs = require("@paikpaik/node-forge/response/nestjs");
const healthNestjs = require("@paikpaik/node-forge/health/nestjs");
assert.ok(core.ForgeBizError, "core: require()로 ForgeBizError 로드 실패");
assert.ok(responseNestjs.ForgeExceptionFilter, "response/nestjs: require()로 ForgeExceptionFilter 로드 실패");
assert.ok(healthNestjs.HealthModule, "health/nestjs: require()로 HealthModule 로드 실패");

const err = new core.ForgeBizError("E9409", "smoke");
const catchTargets = Reflect.getMetadata("__filterCatchExceptions__", responseNestjs.ForgeExceptionFilter);
assert.ok(
  catchTargets.some((C) => err instanceof C),
  "core에서 만든 ForgeBizError가 response/nestjs의 @Catch 대상과 매칭되지 않음 (엔트리 간 클래스 중복 번들링 의심)",
);

console.log("[smoke-test] require() 서브패스 로딩 + 크로스 엔트리 instanceof 검증 통과");
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
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
