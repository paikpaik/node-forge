# 규칙서 작성 원칙

## 파일 크기

- 파일당 **200줄 이하** 우선 유지
- 초과 예상 시 분리 먼저 검토 (관심사 분리 기준)

## 문체

- **긍정형**: "하지 마" 대신 "이렇게 해"
- 예: ~~"mock을 남용하지 말 것"~~ → "통합 테스트는 실제 의존성을 사용한다"

## 중복 제거

- 의미가 겹치면 새 파일보다 기존 문서 수정 먼저 검토
- 같은 규칙이 두 파일에 있으면 더 구체적인 곳에만 남긴다

## 불필요 정보 제거

- AI가 이미 아는 일반 지식은 넣지 않는다
- 이 프로젝트에만 적용되는 규칙, 결정, 제약만 기록

## Sensor 우선

- 기계적으로 검증 가능한 규칙 → hook / 린터 / 타입 시스템으로 강제
- 판단이 필요한 것만 guide 문서로 남긴다

## node-forge 특화 체크리스트

규칙서 작성 시 아래를 먼저 확인:

- [ ] `peerDependencies` 관련 규칙인가? → `rules/project/convention.md`
- [ ] TypeScript 타입 패턴인가? → `rules/language/typescript.md`
- [ ] NestJS Module/Provider 패턴인가? → `rules/stack/nestjs.md`
- [ ] Fastify Plugin 패턴인가? → `rules/stack/fastify.md`
- [ ] 공통 코딩 원칙인가? → `rules/common/` 하위
