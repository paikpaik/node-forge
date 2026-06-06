# .claude-ops 운영 가이드

## 폴더 구조

```
.claude-ops/
├── backups/          ← .claude/ 스냅샷 (날짜별)
│   └── YYYYMMDD/
├── updates/          ← 규칙서 변경 이력
│   └── YYYYMMDD/
│       ├── update.md
│       └── update_1.md   ← 검증 결과 추가 시
└── work/             ← 편집 작업공간 (.claude/ 미러)
```

## 날짜 폴더 규칙

- 날짜 포맷: `YYYYMMDD` (예: `20260606`)
- 같은 날 여러 번 실행 시 `_1`, `_2` 접미사 추가
- `work/`는 단일 폴더 유지 (날짜 없음) — 항상 최신 상태

## 워크플로우

```
/harness-ops --init     ← 최초 1회만
/harness-ops            ← 규칙서 업데이트 전체 플로우
  → backup → work 최신화 → update 작성 → 검증 → work 반영 → .claude/ 동기화
```

## update 체인 작성 원칙

1. **배경 먼저**: 왜 업데이트가 필요한지 먼저 설명
2. **파일 단위**: 파일별로 현재/변경 후/이유를 명시
3. **검증 포인트**: 변경이 올바른지 확인할 기준 포함
4. **체인 참조**: `> 참조: {이전 파일명}`으로 이전 update와 연결
5. **검증 후 update 파일로 응답**: 검증 결과는 반드시 `update_N.md`로 저장
