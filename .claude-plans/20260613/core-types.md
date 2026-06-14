## 플랜 실행 이력

### 완료: 2026-06-13

**결과**: 성공

**실제 변경 파일**:
- `src/core/type-guards.ts` (신규) — `isNonNull`, `isString`, `isNumber`, `isBoolean`, `isObject`, `isArray`, `safeJsonParse`
- `src/core/type-guards.test.ts` (신규) — 7개 describe, 총 22개 테스트 (기존 268 + 20 = 288개)
- `src/core/types.ts` — `Nullable`, `DeepPartial`, `ValueOf`, `RequireFields`, `Resolved` 유틸리티 타입 추가
- `src/core/index.ts` — `export * from './type-guards'` 추가

**계획과의 차이**:
`ArrayValue<T>` 타입 제외 — 실제로 쓰임새가 불분명해 YAGNI 원칙으로 생략

**잔존 작업**:
없음

---

# core-types — 타입 유틸 (Type Guards + Utility Types)

## 목표

런타임 타입 검사 함수(type guards)와 컴파일 타임 유틸리티 타입을 `src/core/`에 추가한다.
타입 가드는 `src/core/type-guards.ts`에, 유틸리티 타입은 기존 `src/core/types.ts`에 확장한다.

## 현재 상태 (AS-IS)

```ts
// src/core/types.ts — 현재 인터페이스와 enum만 있음
export interface RequestContext { ... }
export interface PaginationMeta { ... }
export enum ErrorCode { ... }
```

`isNonNull`이 없어서 `arr.filter(Boolean)`을 쓰면 타입이 `T | null | undefined`로 남거나,
`as T[]`로 강제 캐스팅해야 한다. `DeepPartial`, `Nullable` 같은 유틸리티 타입도 없어
서비스마다 중복 선언하는 상황.

## 변경 후 상태 (TO-BE)

### 신규: `src/core/type-guards.ts`

```ts
// 가장 자주 쓰는 타입 가드 — arr.filter(isNonNull)로 null 제거 + 타입 narrowing
export function isNonNull<T>(value: T | null | undefined): value is T

// 기본 타입 가드
export function isString(value: unknown): value is string
export function isNumber(value: unknown): value is number
export function isBoolean(value: unknown): value is boolean
export function isObject(value: unknown): value is Record<string, unknown>
export function isArray(value: unknown): value is unknown[]

// 안전한 JSON 파싱 — throw 없이 null 반환
export function safeJsonParse<T = unknown>(str: string): T | null
```

### `src/core/types.ts` 확장 — Utility Types 추가

```ts
// T | null | undefined
export type Nullable<T> = T | null | undefined

// 모든 중첩 필드를 optional로
export type DeepPartial<T> = T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T

// 객체의 value union 타입
export type ValueOf<T> = T[keyof T]

// Record의 value를 배열로
export type ArrayValue<T extends Record<string, unknown>> = T[keyof T][]

// 함수 반환 타입의 Promise unwrap (TS 내장 Awaited<T>와 동일하나 명시적 alias)
export type Resolved<T> = T extends Promise<infer R> ? R : T

// 특정 키를 필수로 만들기
export type RequireFields<T, K extends keyof T> = T & Required<Pick<T, K>>
```

### 사용 예시

```ts
// 타입 가드
const names = users.map(u => u.name).filter(isNonNull)  // string[]

// 안전한 JSON 파싱
const config = safeJsonParse<Config>(rawJson)  // Config | null

// 유틸리티 타입
type UpdateUserDto = DeepPartial<User>
type UserId = ValueOf<{ readonly id: number }>  // number

// DB에서 가져온 후 특정 필드 필수화
type UserWithProfile = RequireFields<User, 'profile'>
```

## 변경 범위

| 파일 | 변경 내용 |
|------|----------|
| `src/core/type-guards.ts` (신규) | `isNonNull`, `isString`, `isNumber`, `isBoolean`, `isObject`, `isArray`, `safeJsonParse` |
| `src/core/type-guards.test.ts` (신규) | 각 타입 가드 테스트 |
| `src/core/types.ts` | `Nullable`, `DeepPartial`, `ValueOf`, `ArrayValue`, `Resolved`, `RequireFields` 추가 |
| `src/core/index.ts` | `export * from './type-guards'` 추가 |

## 영향성

| 영향 대상 | 영향 내용 |
|-----------|----------|
| 기존 `types.ts` 내용 | 변경 없음 — 추가만 |
| `core-collection`의 `compact` | `isNonNull`을 내부에서 활용 가능 |

## Breaking Changes

없음

## 위험도

**LOW** — 신규 파일 추가 및 기존 파일에 타입/함수 추가. 기존 코드 변경 없음.

## 주의사항

- **유틸리티 타입은 런타임 코드 없음**: `DeepPartial` 등은 컴파일 타임에만 존재. 빌드 결과물 `.d.ts`에만 포함되고 `.js` 번들 크기에 영향 없음.
- **`isObject` 범위**: `null`은 `typeof null === 'object'`이므로 null 체크를 포함해야 한다. 배열도 object이므로 `Array.isArray` 체크 제외 여부를 결정해야 함 — 이 플랜에서는 **배열은 isObject에서 false** (즉, "순수 객체"만 true).
- **`safeJsonParse` 위치**: 런타임 함수이므로 `types.ts`가 아닌 `type-guards.ts`에 포함. JSON 파싱 결과의 타입은 제네릭으로 받지만 런타임 검증은 하지 않는다 (그것은 zod/class-validator 영역).
- **`Resolved<T>` vs TS 내장 `Awaited<T>`**: TypeScript 4.5+에서 내장 `Awaited<T>`가 있으므로 `Resolved`는 가독성 alias 용도. 중복이라 생각하면 생략 가능.

## 작업 단계

### 1단계: type-guards.ts 구현

1. `isNonNull<T>(value)` — `value !== null && value !== undefined`
2. `isString`, `isNumber`, `isBoolean` — `typeof` 체크
3. `isObject` — `typeof === 'object' && value !== null && !Array.isArray(value)`
4. `isArray` — `Array.isArray(value)`
5. `safeJsonParse<T>(str)` — `try { return JSON.parse(str) as T } catch { return null }`

### 2단계: types.ts 유틸리티 타입 추가

1. `Nullable<T>`, `DeepPartial<T>`, `ValueOf<T>`, `ArrayValue<T>`, `Resolved<T>`, `RequireFields<T, K>` 추가

### 3단계: 테스트 + index.ts export

- `isNonNull`: null, undefined, 0, '', false (모두 non-null로 처리)
- `isString`, `isNumber`, `isBoolean`: 각 타입과 아닌 것
- `isObject`: 순수 객체 true, null/배열/원시값 false
- `safeJsonParse`: 유효한 JSON, 잘못된 JSON(null 반환)

## 검증 방법

- [ ] `npm test` — 신규 테스트 통과 + 기존 회귀 없음
- [ ] `npm run build` — `dist/core/index.d.ts`에 신규 타입·함수 포함
- [ ] `npm run lint` — 통과
- [ ] `[1, null, 2, undefined].filter(isNonNull)` → `number[]` 타입 추론 확인 (TS 컴파일러)
- [ ] `safeJsonParse('invalid')` → `null`, `safeJsonParse('{"a":1}')` → `{ a: number }`

## 참조 규칙

- `.claude/CLAUDE.md` — `core` 순수성: 외부 런타임 의존성 없음
