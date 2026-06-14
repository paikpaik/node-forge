## 플랜 실행 이력

### 완료: 2026-06-13

**결과**: 성공

**실제 변경 파일**:
- `src/core/validation.ts` (신규) — `parsePositiveInt`, `parsePagination`, `parseSort`, `assertDefined`, `requireEnv`
- `src/core/validation.test.ts` (신규) — 5개 describe, 28개 테스트 (기존 288 + 28 = 316개)
- `src/core/index.ts` — `export * from './validation'` 추가

**계획과의 차이**:
없음

**잔존 작업**:
없음

---

# core-validation — 입력 검증 & 파싱 유틸

## 목표

API 레이어에서 매번 직접 짜는 입력 검증·파싱 패턴을 `src/core/validation.ts`에 표준화한다.
외부 런타임 의존성 없이 순수 TypeScript로 구현하며, 잘못된 입력은 명확한 메시지와 함께 즉시 실패한다.

## 현재 상태 (AS-IS)

`src/core/types.ts`에 `PaginationMeta` 인터페이스만 있고, 실제 query string을 안전하게 파싱하거나
환경 변수를 검증하는 함수는 없다. 각 서비스마다 중복으로 직접 구현 중.

## 변경 후 상태 (TO-BE)

### 신규: `src/core/validation.ts`

```ts
// 페이지네이션 파싱 — page/size 클램핑, offset 계산
export interface ParsedPagination {
  page: number   // 1-based, 최소 1
  size: number   // 최소 1, 최대 maxSize (기본 100)
  offset: number // (page - 1) * size
}
export function parsePagination(
  query: { page?: unknown; size?: unknown },
  options?: { defaultSize?: number; maxSize?: number },
): ParsedPagination

// 정렬 파싱 — allowedFields 화이트리스트로 SQL injection 방지
export interface ParsedSort {
  field: string
  direction: 'ASC' | 'DESC'
}
export function parseSort(
  query: { sort?: unknown },
  allowedFields: string[],
  defaultField?: string,
): ParsedSort

// null/undefined면 즉시 throw
export function assertDefined<T>(
  value: T | null | undefined,
  label?: string,
): asserts value is T

// 환경변수 없으면 시작 시 명확한 에러
export function requireEnv(name: string): string

// 안전한 양의 정수 파싱 — 실패 시 null
export function parsePositiveInt(value: unknown): number | null
```

### 사용 예시

```ts
// Controller / Route handler
const { page, size, offset } = parsePagination(req.query, { defaultSize: 20, maxSize: 50 })
const { field, direction } = parseSort(req.query, ['name', 'createdAt', 'score'])

// Service 시작 시
const DB_URL = requireEnv('DATABASE_URL')

// 값 보증
assertDefined(user, 'user') // user: User (null/undefined 제거)
```

## 변경 범위

| 파일 | 변경 내용 |
|------|----------|
| `src/core/validation.ts` (신규) | `parsePagination`, `parseSort`, `assertDefined`, `requireEnv`, `parsePositiveInt` |
| `src/core/validation.test.ts` (신규) | 각 함수별 정상/경계/에러 케이스 |
| `src/core/index.ts` | `export * from './validation'` 추가 |

## 영향성

| 영향 대상 | 영향 내용 |
|-----------|----------|
| 기존 `src/core/*` | 변경 없음 — 신규 파일 추가 |
| `PaginationMeta` (types.ts) | 변경 없음 — `parsePagination` 반환 타입은 별도 `ParsedPagination` |

## Breaking Changes

없음

## 위험도

**LOW** — 외부 의존성 없는 순수 함수 추가. 기존 코드 변경 없음.

## 주의사항

- **`parseSort` SQL injection 방지**: `allowedFields`에 없는 값은 `defaultField`(또는 allowedFields[0])로 fallback. 절대 원본 입력을 그대로 사용하지 않는다.
- **`parsePagination` 클램핑**: `page < 1`이면 1, `size > maxSize`이면 maxSize로 강제. 에러를 던지지 않고 조용히 보정한다 (API 친화적).
- **`assertDefined`**: TypeScript `asserts` 타입 술어로 구현해 이후 코드에서 타입이 narrowing된다.
- **`requireEnv`**: 서비스 시작 시 한 번만 호출하는 용도. 호출 시점에 throw하므로 프로세스 시작 직후 실패가 즉시 드러난다.

## 작업 단계

### 1단계: validation.ts 구현

1. `parsePositiveInt` — `parseInt` + `isFinite` + 양수 체크, 실패 시 null
2. `parsePagination` — `parsePositiveInt` 활용, `offset = (page - 1) * size`
3. `parseSort` — 소문자 변환 후 allowedFields 검사, 방향은 `'asc'`/'desc'` 대소문자 무관 파싱
4. `assertDefined` — `if (value == null) throw new Error(...)`
5. `requireEnv` — `process.env[name]` 없으면 throw

### 2단계: 테스트 작성

- `parsePagination`: 정상 파싱, 클램핑(음수/초과), 기본값, NaN 입력
- `parseSort`: 허용 필드, 미허용 필드(fallback), 대소문자 무관, 방향 파싱
- `assertDefined`: 값 있을 때 pass, null/undefined 시 throw
- `requireEnv`: 있을 때 값 반환, 없을 때 throw
- `parsePositiveInt`: 숫자 문자열, 소수점, 음수, 비숫자

### 3단계: index.ts export 추가

## 검증 방법

- [ ] `npm test` — 신규 테스트 통과 + 기존 회귀 없음
- [ ] `npm run build` — `dist/core/index.d.ts`에 신규 함수 포함
- [ ] `npm run lint` — 통과
- [ ] `parsePagination({ page: '0', size: '999' }, { maxSize: 50 })` → `{ page: 1, size: 50, offset: 0 }`

## 참조 규칙

- `.claude/CLAUDE.md` — `core` 순수성: 외부 런타임 의존성 없음
