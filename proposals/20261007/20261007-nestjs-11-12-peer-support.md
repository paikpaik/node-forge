# node-forge 제안 — NestJS 11/12 peer 지원 (`@nestjs/*` peer 범위 확장 + 스모크 테스트 버전 매트릭스)

## 계기

신규 프로젝트 `hustle`(모바일 게임 서버, NestJS + Fastify 어댑터 + TypeORM/MySQL + Redis)에
node-forge를 공통 모듈로 붙이려고 보니, 현재 NestJS 최신 메이저가 **12.x**(`@nestjs/core@12.1.2`)인데
node-forge의 peer 범위는 `^10.0.0`에 묶여 있다. 신규 프로젝트를 두 메이저 뒤인 10에 고정할 수는 없어서,
node-forge가 11/12를 공식 지원하도록 peer 범위를 넓히는 것을 제안한다.

## 현재 한계

`package.json`의 peerDependencies:

```json
"@nestjs/common": "^10.0.0",
"@nestjs/core": "^10.0.0",
"@nestjs/microservices": "^10.0.0",
```

NestJS 12와 함께 설치하면 npm이 의존성 트리를 풀지 못하고 즉시 실패한다 (`optional` peer여도
설치된 버전이 범위를 벗어나면 충돌로 취급된다):

```
npm error code ERESOLVE
npm error ERESOLVE unable to resolve dependency tree
npm error Found: @nestjs/microservices@12.1.2
npm error Could not resolve dependency:
npm error peerOptional @nestjs/microservices@"^10.0.0" from @paikpaik/node-forge@1.0.10
npm error this command with --force or --legacy-peer-deps
```

소비자 쪽에서 `--legacy-peer-deps`로 우회할 수는 있지만, 그러면 프로젝트 전체의 peer 검사가 꺼져서
다른 패키지의 진짜 충돌까지 가려진다 — 우회가 아니라 node-forge 쪽에서 범위를 고쳐야 한다.

## 사전 검증 결과 (소스 변경 없이 NestJS 버전만 교체)

`v1.0.10`(56109e3) 기준으로, 레포 사본에 `@nestjs/common`/`core`/`microservices`만 각 버전으로 바꿔
설치하고 기존 검증 수단을 그대로 돌렸다. Node `v22.12.0`, fastify `5.8.5`.

| 검증 | NestJS 10.4.22 (현재) | NestJS 11.2.7 | NestJS 12.1.2 |
|---|---|---|---|
| `vitest run` | 497 / 497 통과 | 497 / 497 통과 | 497 / 497 통과 |
| `tsup` 빌드 | 성공 | 성공 | 성공 |
| `tsc --noEmit -p tsconfig.build.json` | 에러 2건 | 동일 2건 (신규 없음) | 동일 2건 (신규 없음) |
| `scripts/smoke-test.mjs` (5개 체크) | 통과 | 통과 | 통과 (아래 주의 참고) |

스모크 테스트는 스크립트 안의 `@nestjs/*@^10`만 각 버전으로 바꾸고, peer 충돌을 넘기기 위해
`--legacy-peer-deps`를 붙여서 돌렸다. dist의 `require()`/`import()` 서브패스 로딩, 크로스 엔트리
`instanceof`, `RolesGuard` DI 메타데이터, `EventsModule`/`GrpcTraceAccessLogInterceptor` 실제 부팅,
`AdminEventsModule` 동적 컨트롤러 + SSE까지 모두 통과했다. 즉 **코드 변경 없이 peer 범위만 넓혀도
동작한다**는 것이 확인됐다.

참고: vitest 중 실제로 Nest DI를 띄우는 테스트는 1개 파일뿐이라, vitest 통과만으로는 근거가 약하다.
런타임 호환성의 실질적인 근거는 위 스모크 테스트(dist + 실제 부팅) 쪽이다.

### 주의 — NestJS 12는 ESM 패키지다

`@nestjs/common`/`core`/`microservices@12`는 `"type": "module"`이고, `@nestjs/core@12`는
`engines.node: ">= 20"`이다. node-forge의 CJS 빌드(`dist/**/*.js`)는 `require("@nestjs/common")`을
하므로, NestJS 12와 쓰면 **Node의 `require(esm)` 기능에 기대서** 동작한다.

- Node `22.12`에서는 동작하지만 아래 경고가 매 프로세스마다 출력된다:
  ```
  ExperimentalWarning: CommonJS module .../check.cjs is loading ES Module .../@nestjs/core/index.js using require().
  Support for loading ES Module in require() is an experimental feature and might change at any time
  ```
- `require(esm)`이 없는 Node 18이나, `20.19` 미만의 20.x에서는 `ERR_REQUIRE_ESM`로 로드 자체가 실패한다.
- 현재 node-forge `engines.node`는 `>=18.0.0`이라, "NestJS 12 + Node 18" 조합이 설치는 되는데 실행은
  안 되는 상태가 된다.

ESM(`import`) 경로(`dist/**/*.mjs`)는 이 문제와 무관하다.

## 제안

**(1) peer 범위 확장**

```json
"@nestjs/common": "^10.0.0 || ^11.0.0 || ^12.0.0",
"@nestjs/core": "^10.0.0 || ^11.0.0 || ^12.0.0",
"@nestjs/microservices": "^10.0.0 || ^11.0.0 || ^12.0.0",
```

10을 바로 끊지 않는 이유: 기존 소비자(forge-lab 쪽 서비스 등)가 10에 있을 수 있고, 위 검증상
10/11/12를 동시에 지원하는 데 코드 분기가 전혀 필요 없다. 10 지원 종료는 별도 메이저 릴리스에서
결정하면 된다.

**(2) 스모크 테스트를 NestJS 버전 매트릭스로**

`scripts/smoke-test.mjs`가 `@nestjs/*@^10`을 하드코딩하고 있어서, 지금은 "10에서만 검증된 패키지"를
배포하는 구조다. 버전을 환경변수로 받도록 바꾸고:

```js
const nestMajor = process.env.NEST_MAJOR ?? "10";
// "@nestjs/common@^" + nestMajor, ...
```

publish 워크플로(`.github/workflows`)에서 `NEST_MAJOR: [10, 11, 12]` 매트릭스로 돌린다.
이번처럼 "소스 테스트는 통과하는데 실제 설치본에서 깨지는" 류의 회귀를 매 메이저마다 잡기 위함이다.
peer 범위를 넓히면 이 단계에서는 `--legacy-peer-deps` 없이 일반 설치로 통과해야 한다 — 그 자체가
(1)이 제대로 적용됐는지의 검증이 된다.

**(3) README에 NestJS 12 + CJS 사용 시 Node 요구사항 명시**

`engines.node`를 올리는 것은 NestJS를 안 쓰는 소비자(core/redis만 쓰는 경우)까지 막으므로 하지 않고,
README에 "NestJS 12와 CommonJS로 함께 쓸 때는 `require(esm)`을 지원하는 Node(20.19+ / 22.12+)가
필요하다"는 한 줄을 추가한다.

**버전**: 기능 추가(지원 범위 확장)이고 기존 소비자에게 깨지는 변경이 없으므로 `v1.1.0`.

## 검증 포인트

- peer 범위 수정 후 `npm pack`한 tarball을 `@nestjs/*@^12`와 함께 **`--legacy-peer-deps` 없이** 설치했을 때
  ERESOLVE 없이 설치되는지 (11, 10도 동일)
- 스모크 테스트 매트릭스 10/11/12가 CI에서 모두 통과하는지
- NestJS 12 + CJS 소비자 + Node 22에서 `require()` 로드가 동작하는지 (경고는 출력돼도 무방)
- 기존 NestJS 10 소비자가 `1.1.0`으로 올렸을 때 동작 변화가 없는지

## 범위 밖 (참고로 발견한 것)

`tsc --noEmit -p tsconfig.build.json`이 NestJS 10을 포함한 **모든 버전에서** 같은 에러 2건을 낸다.
tsup이 타입 체크 없이 번들링해서 빌드는 통과하지만, 이번 변경과 무관한 기존 이슈라 별도로 다루는 게 맞다.

```
src/events/nestjs/events.explorer.ts(37,11): error TS2345: Argument of type 'object' is not assignable to parameter of type 'Function | Type<any>'.
src/events/nestjs/events.explorer.ts(40,28): error TS2345: Argument of type '{}' is not assignable to parameter of type 'string'.
```

(테스트 파일 쪽에도 `logger.test.ts`의 `level: "silent"`, `utils.test.ts`의 `Partial` 관련 타입 에러가 있다 —
vitest는 타입 체크를 안 해서 통과 중.)

## 기각한 대안

- **소비자 쪽에서 `--legacy-peer-deps` / `overrides`로 우회**: 프로젝트마다 반복해야 하고, peer 검사를
  통째로 꺼서 다른 진짜 충돌까지 가린다.
- **peer를 `>=10.0.0`처럼 상한 없이 열기**: NestJS 13에서 뭐가 깨질지 검증하지 않은 상태로 "지원한다"고
  선언하는 셈이라 제외. 새 메이저가 나오면 매트릭스에 추가해 검증한 뒤 범위를 넓히는 쪽이 안전하다.
- **NestJS 10 지원을 이번에 끊고 `^11 || ^12`만**: 코드상 분기가 필요 없어서 끊을 이유가 없고, 끊으면
  메이저 버전업(`v2.0.0`)이 돼서 기존 소비자 업그레이드 비용만 생긴다.
- **`engines.node`를 `>=20.19`로 상향**: NestJS를 쓰지 않는 소비자까지 막게 된다 — README 명시로 충분.

## 상태

`hustle` 서버(`paikpaik/hustleServer`) 초기 세팅이 이 변경을 기다리고 있다. `v1.1.0`이 GitHub Packages에
배포되면 hustleServer를 NestJS 최신 + `@paikpaik/node-forge@^1.1.0`으로 세팅할 예정.
