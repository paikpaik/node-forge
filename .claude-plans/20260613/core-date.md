## 플랜 실행 이력

### 완료: 2026-06-13

**결과**: 성공

**실제 변경 파일**:
- `src/core/date.ts` (신규) — `parseDate`, `isExpired`, `toStartOfDay`, `toEndOfDay`, `daysBetween`, `toDateString`, `toDateTimeString`
- `src/core/date.test.ts` (신규) — 7개 describe, 26개 테스트 (기존 335 + 26 = 361개)
- `src/core/index.ts` — `export * from './date'` 추가

**계획과의 차이**:
없음

**잔존 작업**:
없음

---

# core-date — 날짜 유틸

## 목표

서비스 코드에서 반복되는 날짜 파싱·계산 패턴을 `src/core/date.ts`에 표준화한다.
외부 라이브러리(dayjs, date-fns) 없이 내장 `Date` API만으로 구현해 번들 크기를 늘리지 않는다.

## 현재 상태 (AS-IS)

`src/core/`에 날짜 관련 함수가 전혀 없다. 서비스마다 `new Date(str)`의 유효성을 직접 검사하거나
`toISOString()`으로 포맷을 맞추는 코드를 중복으로 작성 중.

## 변경 후 상태 (TO-BE)

### 신규: `src/core/date.ts`

```ts
// null-safe ISO 날짜 파싱 — 유효하지 않으면 null
export function parseDate(value: unknown): Date | null

// TTL 기준 만료 여부
export function isExpired(date: Date, ttlMs: number): boolean

// 날짜의 자정(00:00:00.000)으로 이동
export function toStartOfDay(date: Date): Date

// 날짜의 끝(23:59:59.999)으로 이동
export function toEndOfDay(date: Date): Date

// 두 날짜 사이의 일수 (절대값, 시간 버림)
export function daysBetween(a: Date, b: Date): number

// Date → 'YYYY-MM-DD' 형식 문자열
export function toDateString(date: Date): string

// Date → 'YYYY-MM-DDTHH:mm:ss' 형식 문자열 (UTC)
export function toDateTimeString(date: Date): string
```

### 사용 예시

```ts
// query string에서 날짜 파싱
const from = parseDate(req.query.from)  // Date | null
if (!from) throw new ForgeHttpError(400, ErrorCode.BAD_REQUEST, '날짜 형식 오류')

// 캐시 만료 확인 (cachedAt + TTL 비교)
if (isExpired(item.cachedAt, 60 * 60 * 1000)) {
  await refresh()
}

// 하루 범위 쿼리
const start = toStartOfDay(new Date())   // 2026-06-13T00:00:00.000Z
const end = toEndOfDay(new Date())       // 2026-06-13T23:59:59.999Z

// 로그 레이블
console.log(toDateString(new Date()))    // '2026-06-13'
```

## 변경 범위

| 파일 | 변경 내용 |
|------|----------|
| `src/core/date.ts` (신규) | `parseDate`, `isExpired`, `toStartOfDay`, `toEndOfDay`, `daysBetween`, `toDateString`, `toDateTimeString` |
| `src/core/date.test.ts` (신규) | 각 함수 테스트 |
| `src/core/index.ts` | `export * from './date'` 추가 |

## 영향성

| 영향 대상 | 영향 내용 |
|-----------|----------|
| 기존 `src/core/*` | 변경 없음 |

## Breaking Changes

없음

## 위험도

**LOW** — 신규 파일 추가, 기존 코드 변경 없음.

## 주의사항

- **`parseDate` 유효성**: `new Date(str)`은 invalid string에 대해 `Invalid Date`를 반환한다. `isNaN(date.getTime())`으로 검사한다. `null`, `undefined`, 빈 문자열, 숫자 등 모두 안전하게 처리.
- **`toStartOfDay` / `toEndOfDay` 타임존**: 내장 `Date`의 `setHours`는 로컬 타임존 기준이다. UTC 기준이 필요한 곳은 `setUTCHours`를 쓰는 별도 함수가 필요하나, 이번 플랜에서는 로컬 타임존 기준으로 구현하고 JSDoc에 명시한다.
- **`daysBetween` 정밀도**: `Math.floor(Math.abs(a - b) / 86_400_000)`으로 일수를 계산한다. 서머타임 전환이 있는 타임존에서는 1ms 오차가 생길 수 있지만 일반 용도에서는 허용 범위다.
- **외부 의존성 없음**: dayjs, date-fns, luxon 등을 추가하지 않는다. 복잡한 타임존 처리나 포맷이 필요하면 호출부에서 직접 라이브러리를 사용하도록 유도한다.

## 작업 단계

### 1단계: date.ts 구현

1. `parseDate(value)` — `typeof value === 'string' || value instanceof Date` 체크 → `new Date(...)` → `isNaN(getTime())` 검사
2. `isExpired(date, ttlMs)` — `Date.now() - date.getTime() > ttlMs`
3. `toStartOfDay(date)` — 원본 불변, 새 Date 반환, `setHours(0,0,0,0)`
4. `toEndOfDay(date)` — 원본 불변, 새 Date 반환, `setHours(23,59,59,999)`
5. `daysBetween(a, b)` — `Math.floor(Math.abs(a.getTime() - b.getTime()) / 86_400_000)`
6. `toDateString(date)` — `date.toISOString().slice(0, 10)`
7. `toDateTimeString(date)` — `date.toISOString().slice(0, 19)`

### 2단계: 테스트 작성

- `parseDate`: ISO 문자열, Date 객체, 숫자, null, undefined, 빈 문자열, 잘못된 문자열
- `isExpired`: 방금 생성된 date(미만료), 오래된 date(만료)
- `toStartOfDay` / `toEndOfDay`: 시간 필드 확인, 원본 불변성
- `daysBetween`: 같은 날, 1일, 7일 차이
- `toDateString` / `toDateTimeString`: 포맷 확인

### 3단계: index.ts export 추가

## 검증 방법

- [ ] `npm test` — 신규 테스트 통과 + 기존 회귀 없음
- [ ] `npm run build` — `dist/core/index.d.ts`에 신규 함수 포함
- [ ] `npm run lint` — 통과
- [ ] `parseDate('not-a-date')` → `null`, `parseDate('2026-06-13')` → 유효한 `Date`

## 참조 규칙

- `.claude/CLAUDE.md` — `core` 순수성: 외부 런타임 의존성 없음
