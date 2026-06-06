# node-forge-initial-setup — Node.js 공통 모듈 패키지 초기 설계 및 셋업

## 플랜 실행 이력

### 완료: 2026-06-06

**결과**: 성공

**실제 변경 파일**:
- `package.json` — `@paikpaik/node-forge` 패키지 메타, exports 맵(24개 서브패스), peerDeps, scripts 완성
- `.npmrc` — `@paikpaik:registry=https://npm.pkg.github.com` 설정
- `tsconfig.json` — strict, decorators, emitDecoratorMetadata, moduleResolution Bundler
- `tsup.config.ts` — 8개 모듈 × 3 entry(core/nestjs/fastify) 동적 생성, dual output
- `vitest.config.ts` — 테스트 환경 구성
- `src/core/types.ts` — ErrorCode enum (E94xx/E95xx), RequestContext, PaginationMeta
- `src/core/errors.ts` — ForgeError, ForgeHttpError, ForgeBizError 계층
- `src/core/utils.ts` — omit, pick, deepMerge 유틸
- `src/response/response.ts` — ApiResponse<T>, ok/fail/paginated 빌더
- `src/response/nestjs/response.interceptor.ts` — NestJS ResponseInterceptor
- `src/response/fastify/response.plugin.ts` — Fastify reply.ok/fail/paginated 데코레이터
- `src/logger/logger.ts` — ForgeLogger (pino), createLogger 팩토리
- `src/logger/nestjs/logger.module.ts` — NestJS LoggerModule.forRoot/forRootAsync
- `src/logger/fastify/logger.plugin.ts` — Fastify fastifyLogger plugin (v5 getter 패턴)
- `src/redis/redis.ts` — ForgeRedisClient (ioredis), lazyConnect, ping
- `src/redis/nestjs/redis.module.ts` — NestJS RedisModule, @InjectRedis()
- `src/redis/fastify/redis.plugin.ts` — Fastify fastifyRedis plugin
- `src/database/database.ts` — createDataSource, runMigrations (TypeORM)
- `src/database/nestjs/database.module.ts` — NestJS DatabaseModule
- `src/http/http.ts` — ForgeHttpClient (axios), retry interceptor, logger 연동
- `src/http/nestjs/http.module.ts` — NestJS HttpModule, @InjectHttpClient()
- `src/events/events.ts` — ForgeEventBus (EventEmitter2), wildcard 지원
- `src/events/nestjs/events.module.ts` — NestJS EventsModule, @OnEvent() auto-register
- `src/metrics/metrics.ts` — ForgeMetrics (prom-client), 격리된 Registry
- `src/metrics/nestjs/metrics.module.ts` — NestJS MetricsModule, /metrics 엔드포인트
- `src/metrics/fastify/metrics.plugin.ts` — Fastify fastifyMetrics plugin
- `.claude/CLAUDE.md` — 레포 구조, 모듈 추가 방법, 퍼블리시 방법 정리
- `.github/workflows/publish.yml` — tag push 시 GitHub Packages 자동 퍼블리시

**계획과의 차이**:
- exports 서브패스가 원래 9개에서 24개로 확장됨: 프레임워크 충돌 방지를 위해 `/nestjs`, `/fastify` 서브패스 분리 추가
- `tsup splitting: false`로 변경 (true 시 서브패스별 청크 분리가 오히려 문제 발생)
- Fastify v5 `decorateRequest`는 reference 타입에 `{ getter: () => value }` 패턴 필요 (v4와 다름)
- `package.json exports`에서 `"types"` 조건이 `"import"` 앞에 와야 TypeScript 인식됨

**잔존 작업**:
없음

---

## 목표

NestJS와 Fastify 양쪽에서 동일하게 사용할 수 있는 단일 npm 패키지 `@paikpaik/node-forge`를 구축한다.
서브패스 exports(`@paikpaik/node-forge/logger` 등)로 각 모듈을 독립적으로 import할 수 있으며,
GitHub Packages에 `.npmrc` 기반으로 퍼블리시한다.

## 현재 상태 (AS-IS)

```
node-forge/
└── .git/          ← git init만 된 상태. 파일 없음.
```

## 변경 후 상태 (TO-BE)

### 레포 구조

```
node-forge/
├── src/
│   ├── index.ts             ← 전체 re-export 진입점
│   ├── core/                — 공유 타입, 에러 클래스, 유틸
│   │   └── index.ts
│   ├── logger/              — 구조화 로깅 (pino)
│   │   ├── index.ts
│   │   ├── logger.ts
│   │   ├── nestjs/
│   │   │   └── logger.module.ts
│   │   └── fastify/
│   │       └── logger.plugin.ts
│   ├── redis/               — Redis 클라이언트 래퍼 (ioredis)
│   │   ├── index.ts
│   │   ├── redis.ts
│   │   ├── nestjs/
│   │   └── fastify/
│   ├── database/            — DB 추상화 (TypeORM)
│   │   ├── index.ts
│   │   ├── database.ts
│   │   ├── nestjs/
│   │   └── fastify/
│   ├── http/                — HTTP 클라이언트 (axios 래퍼)
│   │   ├── index.ts
│   │   ├── http.ts
│   │   ├── nestjs/
│   │   └── fastify/
│   ├── response/            — 표준 응답 형태
│   │   ├── index.ts
│   │   ├── response.ts
│   │   ├── nestjs/
│   │   └── fastify/
│   ├── events/              — 이벤트 버스 (eventemitter2)
│   │   ├── index.ts
│   │   ├── events.ts
│   │   ├── nestjs/
│   │   └── fastify/
│   └── metrics/             — 메트릭 (prom-client)
│       ├── index.ts
│       ├── metrics.ts
│       ├── nestjs/
│       └── fastify/
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── tsup.config.ts
├── vitest.config.ts
├── .eslintrc.js
├── .prettierrc
├── .npmrc                   ← GitHub Packages 레지스트리 설정
├── .gitignore
└── CLAUDE.md
```

### package.json exports 구조

```json
{
  "name": "@paikpaik/node-forge",
  "exports": {
    ".":          { "import": "./dist/index.js",          "require": "./dist/index.cjs" },
    "./core":     { "import": "./dist/core/index.js",     "require": "./dist/core/index.cjs" },
    "./logger":   { "import": "./dist/logger/index.js",   "require": "./dist/logger/index.cjs" },
    "./redis":    { "import": "./dist/redis/index.js",    "require": "./dist/redis/index.cjs" },
    "./database": { "import": "./dist/database/index.js", "require": "./dist/database/index.cjs" },
    "./http":     { "import": "./dist/http/index.js",     "require": "./dist/http/index.cjs" },
    "./response": { "import": "./dist/response/index.js", "require": "./dist/response/index.cjs" },
    "./events":   { "import": "./dist/events/index.js",   "require": "./dist/events/index.cjs" },
    "./metrics":  { "import": "./dist/metrics/index.js",  "require": "./dist/metrics/index.cjs" }
  }
}
```

### 사용 예시

```ts
// NestJS
import { LoggerModule } from '@paikpaik/node-forge/logger'
import { RedisModule } from '@paikpaik/node-forge/redis'
import { ResponseInterceptor } from '@paikpaik/node-forge/response'

// Fastify
import { fastifyLogger } from '@paikpaik/node-forge/logger'
import { fastifyRedis } from '@paikpaik/node-forge/redis'

// 공용 (framework 무관)
import { ForgeError } from '@paikpaik/node-forge/core'
import { ok, fail } from '@paikpaik/node-forge/response'
```

## 변경 범위

| 파일 | 변경 내용 |
|------|----------|
| `package.json` | 패키지 메타, exports 맵, scripts, peerDeps 설정 |
| `.npmrc` | GitHub Packages 레지스트리 `@paikpaik` 스코프 설정 |
| `tsconfig.json` | strict, decorators, path alias |
| `tsup.config.ts` | CJS + ESM dual output, 각 모듈별 entry |
| `src/core/` | 공유 타입, ForgeError 계층, 유틸 |
| `src/response/` | ApiResponse 타입, ok/fail 빌더, NestJS Interceptor, Fastify hook |
| `src/logger/` | ForgeLogger(pino), NestJS Module, Fastify Plugin |
| `src/redis/` | ForgeRedis(ioredis), NestJS Module, Fastify Plugin |
| `src/database/` | DB 연결 팩토리(TypeORM), NestJS Module, Fastify Plugin |
| `src/http/` | ForgeHttpClient(axios), NestJS Module, Fastify Plugin |
| `src/events/` | ForgeEventBus(eventemitter2), NestJS Module, Fastify Plugin |
| `src/metrics/` | ForgeMetrics(prom-client), NestJS Module, Fastify Plugin |

## 영향성

| 영향 대상 | 영향 내용 |
|-----------|----------|
| NestJS 프로젝트 | `@paikpaik/node-forge/{module}` import로 Module/Provider 사용 |
| Fastify 프로젝트 | `app.register(fastify{Module})` 형태로 plugin 등록 |
| GitHub Actions | `NODE_AUTH_TOKEN` 시크릿으로 퍼블리시 파이프라인 필요 |

## Breaking Changes

없음 — 신규 생성

## 위험도

**LOW** — 신규 생성이므로 기존 코드 영향 없음

## 주의사항

- `@nestjs/common`, `fastify`, `typeorm`, `ioredis` 등은 모두 `peerDependencies` — direct deps 금지
- 각 모듈의 `nestjs/`와 `fastify/` 폴더는 해당 framework 없이 import되어도 런타임 에러 없어야 함 (dynamic import 또는 optional peer 패턴)
- `tsup`의 `splitting: true`로 공통 코드 중복 방지

## 작업 단계

### 1단계: 프로젝트 기반 셋업

1. `package.json` 생성 (`@paikpaik/node-forge`, peerDeps 포함)
2. `.npmrc` 생성 — `@paikpaik:registry=https://npm.pkg.github.com`
3. `tsconfig.json`, `tsconfig.build.json` 생성
4. `tsup.config.ts` 생성 — 8개 모듈 entry + dual output
5. `vitest.config.ts` 생성
6. `.eslintrc.js`, `.prettierrc`, `.gitignore` 생성
7. `npm install` 실행

### 2단계: @forge/core 구현

> 모든 모듈이 의존하므로 먼저 구현

1. `RequestContext` 타입 (traceId, userId, requestId)
2. `PaginationMeta` 타입
3. `ErrorCode` enum (공통 에러 코드)
4. `ForgeError` 기반 클래스 → `ForgeHttpError`, `ForgeBizError` 계층
5. `deepMerge`, `omit`, `pick` 유틸

### 3단계: response 모듈 구현

1. `ApiResponse<T>` 인터페이스
2. `ok(data)`, `fail(code, message)`, `paginated(data, meta)` 빌더
3. NestJS: `ResponseInterceptor` (`ClassSerializerInterceptor` 패턴)
4. Fastify: `replyDecorator` — `reply.ok()`, `reply.fail()`

### 4단계: logger 모듈 구현

1. `ForgeLogger` — pino 기반, context/traceId 자동 포함
2. `createLogger(options)` 팩토리
3. NestJS: `LoggerModule.forRoot(options)`, `LoggerModule.forRootAsync()`
4. Fastify: `fastifyLogger` plugin (fastify-plugin 래퍼)
5. log level, pretty-print, redact 옵션

### 5단계: redis 모듈 구현

1. `ForgeRedisClient` — ioredis 래퍼, connection 옵션
2. NestJS: `RedisModule.forRoot()`, `RedisModule.forRootAsync()`, `@InjectRedis()` 데코레이터
3. Fastify: `fastifyRedis` plugin
4. health check 메서드 (`ping()`)

### 6단계: database 모듈 구현

1. `createDataSource(options)` — TypeORM DataSource 팩토리
2. NestJS: `DatabaseModule.forRoot()`, `DatabaseModule.forRootAsync()`
3. Fastify: `fastifyDatabase` plugin
4. migration runner 유틸 (`runMigrations()`)

### 7단계: http 모듈 구현

1. `ForgeHttpClient` — axios 래퍼, retry/timeout/interceptor
2. 요청/응답 자동 로깅 (logger 모듈 optional 연동)
3. NestJS: `HttpModule.register()`, `@InjectHttpClient()` 데코레이터
4. Fastify: `fastifyHttp` plugin

### 8단계: events 모듈 구현

1. `ForgeEventBus` — EventEmitter2 래퍼, typed events, async emit
2. NestJS: `EventsModule`, `EventsService`, `@OnEvent()` 데코레이터
3. Fastify: `fastifyEvents` plugin

### 9단계: metrics 모듈 구현

1. `ForgeMetrics` — prom-client 래퍼 (Counter, Gauge, Histogram)
2. 기본 메트릭 자동 수집: HTTP duration, error rate
3. NestJS: `MetricsModule`, `/metrics` 엔드포인트 자동 등록
4. Fastify: `fastifyMetrics` plugin, `/metrics` route 자동 등록

### 10단계: 빌드 & 퍼블리시 설정

1. `npm run build` — tsup 전체 빌드 검증
2. `npm test` — vitest 전체 테스트 실행
3. GitHub Actions workflow 작성 — tag push 시 자동 퍼블리시
4. `CLAUDE.md` 작성 — 레포 구조, 모듈 추가 방법, 퍼블리시 방법

## 검증 방법

- [ ] `npm install` 오류 없이 완료
- [ ] `npm run build` — `dist/` 에 각 모듈별 `.js` + `.cjs` + `.d.ts` 생성
- [ ] `npm test` — 전체 테스트 통과
- [ ] `import { ok } from '@paikpaik/node-forge/response'` 타입 에러 없음
- [ ] `import { LoggerModule } from '@paikpaik/node-forge/logger'` NestJS 타입 에러 없음
- [ ] `import { fastifyLogger } from '@paikpaik/node-forge/logger'` Fastify 타입 에러 없음
- [ ] `npm publish --dry-run` — 패키지 구조 확인

## 참조 규칙

- `peerDependencies` 원칙 → NestJS/Fastify/TypeORM/ioredis는 항상 peer, direct deps 금지
- tsup dual output → 모든 모듈은 CJS + ESM + `.d.ts` 동시 생성
- GitHub Packages → `@paikpaik` 스코프, `.npmrc`에 레지스트리 설정
