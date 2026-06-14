## 플랜 실행 이력

### 완료: 2026-06-13

**결과**: 성공

**실제 변경 파일**:
- `src/core/utils.ts` — `chunk`, `groupBy`, `keyBy`, `compact` 추가 (62줄 → 118줄)
- `src/core/utils.test.ts` — import 확장 + 4개 describe 블록 추가 (기존 253 + 15 = 총 268개)

**계획과의 차이**:
없음

**잔존 작업**:
없음. 기존 `deepMerge` 테스트에 pre-existing TypeScript 타입 에러 2건 있으나 vitest 실행에 영향 없음.

---

# core-collection — 배열 & 컬렉션 유틸

## 목표

배치 DB 쿼리, 데이터 인덱싱, 그루핑 등에서 매번 손으로 짜는 배열 처리 패턴을 `src/core/utils.ts`에 추가한다.
기존 `omit`/`pick`/`deepMerge`와 같은 파일에 넣어 컬렉션 유틸 파일로 확장한다.

## 현재 상태 (AS-IS)

```ts
// src/core/utils.ts — 현재 62줄, 객체 유틸만 있음
export function omit<T, K extends keyof T>(obj: T, keys: K[]): Omit<T, K>
export function pick<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K>
export function deepMerge<T>(target: T, ...sources: Partial<T>[]): T
```

배열을 다루는 `chunk`, `groupBy`, `keyBy`가 없어 서비스 코드에서 직접 구현 중.

## 변경 후 상태 (TO-BE)

### utils.ts 확장

```ts
// 배열을 N개씩 분할 — 배치 DB 쿼리, bulk insert에 필수
export function chunk<T>(arr: T[], size: number): T[][]

// 배열 → Map 그루핑 — { [key]: T[] }
export function groupBy<T, K extends string | number | symbol>(
  arr: T[],
  keyFn: (item: T) => K,
): Record<K, T[]>

// 배열 → Record 인덱싱 — O(1) 조회용 Map 생성
export function keyBy<T, K extends string | number | symbol>(
  arr: T[],
  keyFn: (item: T) => K,
): Record<K, T>

// null/undefined 필터링 — 타입 narrowing 포함
export function compact<T>(arr: (T | null | undefined)[]): T[]
```

### 사용 예시

```ts
// 1000개 ID를 100개씩 배치로 나눠 쿼리
const batches = chunk(userIds, 100)
for (const batch of batches) {
  await repo.findByIds(batch)
}

// 배열 → key로 바로 접근
const byId = keyBy(users, (u) => u.id)
const user = byId[userId]  // O(1)

// 카테고리별 그루핑
const byCategory = groupBy(products, (p) => p.categoryId)

// null 제거 + 타입 보장
const names = compact(users.map(u => u.name))  // string[]
```

## 변경 범위

| 파일 | 변경 내용 |
|------|----------|
| `src/core/utils.ts` | `chunk`, `groupBy`, `keyBy`, `compact` 추가 |
| `src/core/utils.test.ts` | 신규 함수 테스트 추가 |

`src/core/index.ts`는 변경 없음 — 이미 `export * from './utils'`가 있음.

## 영향성

| 영향 대상 | 영향 내용 |
|-----------|----------|
| 기존 `omit`/`pick`/`deepMerge` | 변경 없음 |
| `utils.ts` 파일 크기 | 62줄 → 약 120줄 (200줄 이내 유지) |

## Breaking Changes

없음

## 위험도

**LOW** — 기존 함수에 영향 없는 순수 함수 추가.

## 주의사항

- **`chunk` 빈 배열**: `size <= 0`이면 에러를 던진다. 유효하지 않은 batch size가 조용히 무시되면 더 위험.
- **`groupBy` 키 타입**: 반환 타입 `Record<K, T[]>`에서 키가 없는 경우 `undefined`가 될 수 있으나 TypeScript가 `T[]`로 인식한다. 실제 접근 시 undefined 체크 필요함을 JSDoc에 명시.
- **`compact`**: TypeScript `Array.filter`의 타입 추론이 기본적으로 narrowing을 지원하지 않아, `(v): v is T` 타입 술어를 명시적으로 써야 한다.

## 작업 단계

### 1단계: utils.ts 확장

1. `chunk<T>(arr, size)` — `size <= 0` 시 throw, `for` 루프로 slice
2. `groupBy<T, K>(arr, keyFn)` — `reduce`로 구현
3. `keyBy<T, K>(arr, keyFn)` — `reduce`로 구현
4. `compact<T>(arr)` — `filter`에 타입 술어 사용

### 2단계: 테스트 추가

- `chunk`: 정상 분할, 나머지 처리, 빈 배열, size=0 에러
- `groupBy`: 단일 키, 다중 키, 빈 배열
- `keyBy`: 정상 인덱싱, 중복 키(뒤 값으로 덮어씀), 빈 배열
- `compact`: null/undefined 제거, 빈 배열, 혼합 배열

## 검증 방법

- [ ] `npm test` — 신규 테스트 통과 + 기존 `omit`/`pick`/`deepMerge` 테스트 회귀 없음
- [ ] `npm run build` — `dist/core/index.d.ts`에 신규 함수 포함
- [ ] `npm run lint` — 통과
- [ ] `chunk([1,2,3,4,5], 2)` → `[[1,2],[3,4],[5]]`
- [ ] `compact([1, null, 2, undefined, 3])` → `number[]` 타입으로 `[1,2,3]`

## 참조 규칙

- `.claude/CLAUDE.md` — `core` 순수성: 외부 런타임 의존성 없음
