# api-versioning-module — Accept-Version 헤더 기반 버전 협상 유틸 모듈 추가

## 플랜 실행 이력

### 완료: 2026-06-07

**결과**: 성공

**실제 변경 파일**:
- `src/versioning/versioning.ts`, `index.ts` — `VersionOptions`/`VersionResolution` 타입 + `resolveVersion` 순수 함수, `DEFAULT_HEADER_NAME` 상수
- `src/versioning/nestjs/versioning.decorator.ts`, `index.ts` — `ApiVersion(options)` 파라미터 데코레이터 (`createParamDecorator`)
- `src/versioning/fastify/versioning.plugin.ts`, `index.ts` — `request.getApiVersion(options)` 데코레이터 plugin (`decorateRequest` getter, Fastify v5 컨벤션)
- `src/versioning/{versioning,nestjs/versioning.decorator,fastify/versioning.plugin}.test.ts` — 15개 테스트 (core 8 + nestjs 4 + fastify 3)
- `tsup.config.ts` — `modules` 배열에 `'versioning'` 추가
- `package.json` — exports에 3개 path 추가, 기존 항목까지 포함해 정렬 폭 재계산 후 전체 재정렬
- `src/index.ts` — `export * from './versioning'` 추가

**계획과의 차이**:
- `package.json` exports 정렬: 새 키(`./versioning/fastify`)가 기존 최장 키보다 길어 정렬이 깨지는 문제가 있어, 사용자 피드백("정렬을 맞추려면 전부 맞추거나 없애거나")에 따라 전체 exports 블록의 정렬 폭을 재계산해 일괄 재정렬함 (스크립트로 생성)

**잔존 작업**:
없음 — `npm test` 181개 전부 통과, `npm run build`로 3개 export path(`versioning`/`versioning/nestjs`/`versioning/fastify`)의 `.d.ts` 생성 확인

---

## 목표

`Accept-Version` 헤더를 파싱해, 호출자가 전달한 기본/지원 버전 정보를 바탕으로 최종 사용할 API 버전을 결정해주는 순수 협상 로직(`resolveVersion`)과, NestJS/Fastify에서 이를 편하게 쓸 수 있는 어댑터를 제공한다. 헤더가 없거나 지원하지 않는 값이면 자동으로 기본(최신) 버전으로 폴백해 node-forge의 사용성을 높인다.

## 현재 상태 (AS-IS)

- node-forge에 `Accept-Version` 헤더 파싱 / 버전 협상 유틸이 없음
- 각 서비스가 `@Headers('accept-version')`(NestJS) / `request.headers['accept-version']`(Fastify)으로 직접 헤더를 꺼내 "없으면 기본값, 지원 안 하면 기본값" 분기 로직을 매번 자체 작성해야 함 — 로직 중복, 버전 비교 컨벤션 산재
- NestJS는 내장 `VersioningType.HEADER` + `defaultVersion`이 있지만 Fastify에는 동등한 기능이 없어 두 스택 간 사용성 격차가 있음

## 변경 후 상태 (TO-BE)

```ts
// src/versioning/versioning.ts — core (프레임워크 의존성 없음)
export interface VersionOptions {
  defaultVersion: string
  supportedVersions?: string[]
  headerName?: string  // 기본 'accept-version'
}

export interface VersionResolution {
  requested: string | null   // 헤더에서 파싱된 원본 값 (없으면 null)
  resolved: string           // 최종 사용할 버전
  isFallback: boolean        // 헤더 부재/미지원으로 기본값으로 폴백했는지
}

export function resolveVersion(
  headerValue: string | string[] | undefined | null,
  options: VersionOptions,
): VersionResolution

// src/versioning/nestjs — @ApiVersion(options) 파라미터 데코레이터
export const ApiVersion: (options: VersionOptions) => ParameterDecorator

// src/versioning/fastify — request.getApiVersion(options) 데코레이터
declare module 'fastify' {
  interface FastifyRequest {
    getApiVersion(options: VersionOptions): VersionResolution
  }
}
```

### 사용 예시

```ts
// NestJS
@Get()
findAll(@ApiVersion({ defaultVersion: 'v2', supportedVersions: ['v1', 'v2'] }) version: VersionResolution) {
  if (version.resolved === 'v1') return this.legacyService.findAll()
  return this.service.findAll()
}

// Fastify
fastify.get('/items', async (request) => {
  const version = request.getApiVersion({ defaultVersion: 'v2', supportedVersions: ['v1', 'v2'] })
  return version.resolved === 'v1' ? legacyHandler() : handler()
})
```

## 변경 범위

| 파일 | 변경 내용 |
|------|----------|
| `src/versioning/versioning.ts` | `VersionOptions`/`VersionResolution` 타입 + `resolveVersion` 순수 함수 |
| `src/versioning/index.ts` | re-export |
| `src/versioning/nestjs/versioning.decorator.ts` | `ApiVersion` 파라미터 데코레이터 (`createParamDecorator`) |
| `src/versioning/nestjs/index.ts` | re-export |
| `src/versioning/fastify/versioning.plugin.ts` | `getApiVersion` request 데코레이터 plugin (`fp` 래핑) |
| `src/versioning/fastify/index.ts` | re-export |
| `src/index.ts` | core 모듈 re-export 추가 |
| `tsup.config.ts` | `modules` 배열에 `'versioning'` 추가 → 3-path entry 자동 등록 |
| `package.json` | `exports`에 3개 path 추가 (`types` → `import` → `require` 순서) |
| `src/versioning/*.test.ts` | 단위 테스트 |

## 영향성

| 영향 대상 | 영향 내용 |
|-----------|----------|
| 기존 8개 모듈 | 변경 없음 — 신규 모듈만 추가 |
| `src/index.ts` | core export만 추가. 프레임워크 코드는 export하지 않음 (프레임워크 격리 원칙 준수) |
| NestJS 내장 versioning | 대체하지 않음 — node-forge는 협상 결과 제공만, 실제 라우팅 분기는 호출 측 책임 |

## Breaking Changes

없음 — 신규 모듈 추가

## 위험도

**LOW** — 신규 모듈 단독 추가. 기존 모듈/코드 변경 없음.

## 주의사항

- 버전 비교는 단순 동등 비교(`supportedVersions.includes(requested)`)로 시작한다. semver 범위 비교 등은 YAGNI — 실제 필요해지면 별도 작업으로 확장
- `headerName` 기본값은 `'accept-version'`. HTTP 헤더는 Node.js/Fastify 모두 소문자로 정규화되어 들어오므로 별도 대소문자 처리 불필요
- 중복 헤더로 배열(`string[]`)이 들어오는 경우 첫 번째 값만 사용한다 (명세상 통상적인 처리 방식)
- NestJS/Fastify 어댑터는 등록 시점에 옵션을 주입받지 않고, **호출 시점에 `options`를 명시적으로 전달**받는다 — node-forge는 "어떤 버전이 최신인지" 알 수 없고 서비스마다 다르므로, 협상 로직만 제공하고 기준값은 호출자가 책임진다 (사용자 확정 사항)

## 작업 단계

### 1단계: core 협상 로직

1. `VersionOptions`/`VersionResolution` 타입 정의
2. `resolveVersion` 구현 — 헤더 파싱(배열 처리 포함), 지원 버전 검증, 기본값 폴백
3. 테스트: 헤더 없음 / 지원 버전 요청 / 미지원 버전 요청 / 배열 헤더 시나리오

### 2단계: NestJS 어댑터

1. `ApiVersion(options)` 파라미터 데코레이터 (`createParamDecorator` + `ExecutionContext`에서 헤더 추출 후 `resolveVersion` 호출)
2. `index.ts` re-export
3. 테스트: `ExecutionContext` mock 기반 단위 테스트 (헤더 있음/없음/미지원 버전)

### 3단계: Fastify 어댑터

1. `getApiVersion` request 데코레이터 plugin (`fp` 래핑, `decorateRequest`로 등록)
2. `index.ts` re-export
3. 테스트: `FastifyRequest` mock 기반 단위 테스트

### 4단계: 빌드 설정 통합

1. `tsup.config.ts` — `modules` 배열에 `'versioning'` 추가
2. `package.json` — `exports`에 `./versioning`, `./versioning/nestjs`, `./versioning/fastify` 3개 path 추가
3. `src/index.ts` — `export * from './versioning'` 추가
4. `npm run build` 실행 — 3개 export path의 `.d.ts`가 정확히 생성되는지 확인

## 검증 방법

- [ ] `npm test` — 전체 테스트 통과 (15개 이상 추가 예상)
- [ ] `npm run build` — 빌드 성공, `versioning`/`versioning/nestjs`/`versioning/fastify` 3개 path의 `.d.ts` 생성 확인
- [ ] `resolveVersion` — 헤더 없음 시 `{ requested: null, resolved: defaultVersion, isFallback: true }` 반환 확인
- [ ] `resolveVersion` — 미지원 버전 요청 시 기본값으로 폴백하고 `isFallback: true` 확인
- [ ] `resolveVersion` — 지원 버전 요청 시 그대로 `resolved`에 반영하고 `isFallback: false` 확인

## 참조 규칙

- `.claude/CLAUDE.md` — 새 모듈 추가 8단계, 3-path export 컨벤션, exports `types` 순서, 프레임워크 격리·core 순수성 원칙
- `[[redis-module-enhancement]]` — `@description` JSDoc 작성 컨벤션 및 mock 기반 단위 테스트 패턴 참고
