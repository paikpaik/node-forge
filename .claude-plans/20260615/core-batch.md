## 플랜 실행 이력

### 완료: 2026-06-15

**결과**: 성공

**실제 변경 파일**:
- `src/core/batch.ts` (신규) — `processBatch`, `BatchOptions`
- `src/core/batch.test.ts` (신규) — 12개 테스트 (기존 384 + 12 = 396개)
- `src/core/index.ts` — `export * from './batch'` 추가

**계획과의 차이**:
없음

**잔존 작업**:
없음

---

# core-batch — 배치 처리 유틸

## 목표

대용량 배열을 chunk 단위로 나눠 처리하는 `processBatch`를 `src/core/batch.ts`에 추가한다.
이미 구현된 `chunk` / `mapConcurrent` / `sleep`을 조합해, 배치 서버에서 자주 필요한
"청크 분할 + 청크 내 병렬 처리 + 청크 간 지연" 패턴을 표준화한다.

## 현재 상태 (AS-IS)

`mapConcurrent`(동시 처리), `chunk`(배열 분할), `sleep`(지연)은 이미 있지만
이를 합친 "청크 단위 배치 처리" 함수는 없다. 서비스마다 직접 조합해서 쓰고 있음:

```ts
// 현재 호출부가 직접 짜야 하는 패턴
for (const chunk of chunk(items, 100)) {
  await mapConcurrent(chunk, handler, 5)
  await sleep(500)
}
```

## 변경 후 상태 (TO-BE)

### 신규: `src/core/batch.ts`

```ts
export interface BatchOptions {
  /** 한 번에 처리할 항목 수 */
  chunkSize: number
  /** 청크 내 동시 처리 수. 기본값 1 (순차) */
  concurrency?: number
  /** 청크 간 대기 ms. 기본값 0 (즉시) */
  delayMs?: number
  /** 청크 처리 완료 후 호출되는 콜백. 진행률 로깅에 활용한다 */
  onChunkComplete?: (processed: number, total: number) => void
}

export async function processBatch<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  options: BatchOptions,
): Promise<R[]>
```

### 사용 예시

```ts
// 10만 건 이메일 발송 — 100개씩 5개 동시, 청크 사이 500ms 대기
const results = await processBatch(users, sendEmail, {
  chunkSize: 100,
  concurrency: 5,
  delayMs: 500,
  onChunkComplete: (done, total) =>
    logger.info(`진행률: ${done}/${total}`),
})

// DB 마이그레이션 — 1000건씩 순차 처리
await processBatch(rows, migrateRow, { chunkSize: 1_000 })
```

### 동작 규칙

- 입력 배열을 `chunk(items, chunkSize)`로 분할
- 각 청크를 `mapConcurrent(chunk, fn, concurrency)`로 처리
- fn의 `index` 인수는 원본 배열 기준 전역 인덱스
- 청크 완료 후 `onChunkComplete(처리된 누적 수, 전체 수)` 호출
- 마지막 청크 제외, 청크 완료 후 `sleep(delayMs)` 대기
- 하나라도 실패하면 즉시 throw (fail-fast, `mapConcurrent`와 동일)
- `chunkSize <= 0`이면 에러

## 변경 범위

| 파일 | 변경 내용 |
|------|----------|
| `src/core/batch.ts` (신규) | `processBatch`, `BatchOptions` |
| `src/core/batch.test.ts` (신규) | 정상·경계·에러 케이스 테스트 |
| `src/core/index.ts` | `export * from './batch'` 추가 |

## 영향성

| 영향 대상 | 영향 내용 |
|-----------|----------|
| `src/core/utils.ts` | 변경 없음 — `chunk` import만 |
| `src/core/async.ts` | 변경 없음 — `mapConcurrent`, `sleep` import만 |
| 기존 테스트 전체 | 변경 없음 |

## Breaking Changes

없음

## 위험도

**LOW** — 신규 파일 추가. 기존 코드 변경 없음.

## 주의사항

- **전역 인덱스 보존**: fn의 두 번째 인수는 원본 배열 기준 인덱스다.
  청크 내 로컬 인덱스가 아닌 `baseIndex + localIndex`를 전달한다.
- **마지막 청크 sleep 없음**: 불필요한 대기를 없애기 위해 마지막 청크 후에는 sleep을 호출하지 않는다.
- **빈 배열 처리**: 빈 배열이면 루프 없이 `[]` 반환. `chunkSize` 유효성 검사는 선행한다.
- **fail-fast**: `mapConcurrent`를 그대로 사용하므로 청크 내 하나라도 실패하면 즉시 throw.
  에러 수집 패턴이 필요하면 fn 내에서 try/catch로 처리하도록 유도한다.

## 작업 단계

### 1단계: batch.ts 구현

1. `chunk`, `mapConcurrent`, `sleep` import
2. `BatchOptions` 인터페이스 export
3. `processBatch<T, R>` 함수:
   - `chunkSize <= 0` 검증
   - `chunk(items, chunkSize)`로 분할
   - for 루프: `mapConcurrent` → `onChunkComplete` → `sleep` (마지막 제외)
   - 결과 누적 후 반환

### 2단계: 테스트 작성

- 결과가 입력 순서와 같다
- 전역 인덱스가 올바르게 전달된다
- concurrency로 청크 내 동시 실행을 제한한다
- onChunkComplete가 청크마다 호출된다
- delayMs만큼 청크 간 대기한다 (fake timer)
- 빈 배열 → 빈 배열 반환
- chunkSize <= 0 → 에러
- fn 실패 시 즉시 throw

### 3단계: index.ts export 추가

## 검증 방법

- [ ] `npm test` — 신규 테스트 통과 + 기존 384개 회귀 없음
- [ ] `npm run build` — `dist/core/index.d.ts`에 `processBatch` 포함
- [ ] `npm run lint` — 통과

## 참조 규칙

- `.claude/CLAUDE.md` — `core` 순수성: 외부 런타임 의존성 없음
