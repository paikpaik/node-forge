# node-forge — Claude AI Guidelines

## 프로젝트 개요

| 항목 | 내용 |
|------|------|
| 패키지명 | `@paikpaik/node-forge` |
| 퍼블리시 | GitHub Packages (`.npmrc`, `NODE_AUTH_TOKEN: GITHUB_TOKEN`) |
| 기술 스택 | TypeScript, npm, tsup (CJS+ESM dual output), vitest |
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
| 5 | `rules/language/korean.md` | 응답 언어(한국어)·톤 가이드 |

### 상황별 적용

| 상황 | 규칙 |
|------|------|
| 모듈 추가 / 구조 변경 | `rules/project/convention.md` |
| TypeScript 타입 작업 | `rules/language/typescript.md` |
| NestJS 모듈 작성 | `rules/stack/nestjs.md` |
| Fastify 플러그인 작성 | `rules/stack/fastify.md` |

---

## 패키지 구조

```
src/
├── core/       외부 런타임 deps 없는 순수 타입/유틸
├── response/   ApiResponse<T>, ok/fail/paginated
├── logger/     ForgeLogger (pino)
├── redis/      ForgeRedisClient (ioredis)
├── database/   TypeORM DataSource 팩토리
├── http/       ForgeHttpClient (axios)
├── events/     ForgeEventBus (eventemitter2)
└── metrics/    ForgeMetrics (prom-client)
```

각 모듈은 3개의 export path를 가진다:

```
@paikpaik/node-forge/{module}           → 프레임워크 무관 코어
@paikpaik/node-forge/{module}/nestjs    → NestJS Module/Provider/Decorator
@paikpaik/node-forge/{module}/fastify   → Fastify Plugin
```

---

## 새 모듈 추가 방법

1. `src/{module}/` 폴더 생성
2. `{module}.ts` — 코어 구현 (프레임워크 deps 없음)
3. `nestjs/` — Module, Service/Provider, 필요 시 Decorator
4. `fastify/` — fp() 래핑된 Plugin
5. 각 폴더에 `index.ts` 추가 (re-export)
6. `tsup.config.ts` — `entry`에 3개 path 추가
7. `package.json` — `exports`에 3개 path 추가
8. `src/index.ts` — 코어 모듈 re-export 추가

---

## 빌드 / 테스트 / 퍼블리시

```bash
npm run build     # tsup: CJS + ESM + .d.ts 생성
npm test          # vitest: src/**/*.test.ts
npm run lint      # eslint src/
npm run format    # prettier src/

# 퍼블리시 (tag push 시 GitHub Actions 자동 실행)
git tag v0.1.0 && git push origin v0.1.0
```

---

## 핵심 규칙

- **peerDependencies 원칙**: `@nestjs/*`, `fastify`, `typeorm`, `ioredis` 등 프레임워크 deps는 반드시 `peerDependencies`. `dependencies`에 절대 금지.
- **dual output**: 모든 모듈은 tsup으로 CJS + ESM + `.d.ts` 동시 빌드.
- **`core` 순수성**: `src/core`는 외부 런타임 의존성 없음.
- **프레임워크 격리**: 코어 index는 프레임워크 코드를 export하지 않는다 (런타임 에러 방지).
- **에러 코드**: `E94xx` 클라이언트 오류, `E95xx` 서버/인프라 오류.
- **exports `types` 순서**: `package.json` exports에서 `"types"`는 항상 `"import"` 앞에.
