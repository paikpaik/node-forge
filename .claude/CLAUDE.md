# node-forge — Claude AI Guidelines

## 프로젝트 개요

| 항목 | 내용 |
|------|------|
| 패키지명 | `@paikpaik/node-forge` |
| 퍼블리시 | GitHub Packages (`.npmrc`) |
| 기술 스택 | TypeScript, pnpm, tsup (CJS+ESM dual output) |
| 역할 | NestJS / Fastify 공용 Node.js 공통 모듈 패키지 |

---

## BOOT SEQUENCE

Claude는 작업 시작 전 아래 순서로 규칙서를 읽는다.

### 항상 적용

| 순서 | 규칙 | 내용 |
|------|------|------|
| 1 | `rules/common/quality.md` | 셀프리뷰, 안티 패턴 |
| 2 | `rules/common/principles.md` | DRY, YAGNI, Fail Fast |
| 3 | `rules/common/patterns.md` | 구조/행위/비동기 패턴 |
| 4 | `rules/common/workflow.md` | 의도 파악, 플래닝 프로세스 |

### 상황별 적용

| 상황 | 규칙 |
|------|------|
| 모듈 추가 / 구조 변경 | `rules/project/convention.md` |
| TypeScript 타입 작업 | `rules/language/typescript.md` |
| NestJS 모듈 작성 | `rules/stack/nestjs.md` |
| Fastify 플러그인 작성 | `rules/stack/fastify.md` |
| 마이그레이션 / 리팩토링 | `rules/common/migration.md` |

---

## 패키지 구조

```
src/
├── core/       — 공유 타입, ForgeError 계층, 유틸 (외부 런타임 deps 없음)
├── response/   — ApiResponse<T>, ok/fail 빌더, NestJS Interceptor, Fastify decorator
├── logger/     — ForgeLogger(pino), NestJS Module, Fastify Plugin
├── redis/      — ForgeRedisClient(ioredis), NestJS Module, Fastify Plugin
├── database/   — TypeORM DataSource 팩토리, NestJS Module, Fastify Plugin
├── http/       — ForgeHttpClient(axios), NestJS Module, Fastify Plugin
├── events/     — ForgeEventBus(eventemitter2), NestJS Module, Fastify Plugin
└── metrics/    — ForgeMetrics(prom-client), NestJS Module, Fastify Plugin
```

---

## 핵심 규칙 (요약)

- **peerDependencies 원칙**: `@nestjs/*`, `fastify`, `typeorm`, `ioredis` 등 프레임워크 deps는 반드시 `peerDependencies`. `dependencies`에 절대 금지.
- **dual output**: 모든 모듈은 tsup으로 CJS + ESM + `.d.ts` 동시 빌드.
- **`@forge/core` 순수성**: `src/core`는 외부 런타임 의존성 없이 타입/유틸만 포함.
- **프레임워크 격리**: `nestjs/`와 `fastify/` 폴더는 해당 프레임워크 없이 import해도 런타임 에러 없어야 함.
