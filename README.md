# @paikpaik/node-forge

NestJS / Fastify 공용 Node.js 공통 모듈 패키지입니다. 각 모듈은 프레임워크에 의존하지 않는 코어 구현과, NestJS / Fastify 전용 어댑터를 함께 제공합니다.

## 설치

GitHub Packages에 배포되어 있으므로, `@paikpaik` 스코프를 GitHub Packages 레지스트리로 지정해야 합니다.

```bash
# .npmrc
@paikpaik:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

```bash
npm install @paikpaik/node-forge
```

## 모듈

각 모듈은 3개의 export path를 가집니다.

```
@paikpaik/node-forge/{module}           # 프레임워크 무관 코어
@paikpaik/node-forge/{module}/nestjs    # NestJS Module/Provider/Decorator
@paikpaik/node-forge/{module}/fastify   # Fastify Plugin
```

| 모듈 | 설명 |
|------|------|
| `core` | 외부 런타임 의존성 없는 순수 타입/유틸 (validation, date, traceparent 등) |
| `response` | `ApiResponse<T>` 표준 응답 포맷과 `ok`/`fail`/`paginated` 헬퍼 |
| `logger` | `pino` 기반 로거. NestJS `LoggerService`, Fastify 로깅 인터페이스와 호환 |
| `redis` | `ioredis` 기반 클라이언트. 캐싱, 분산 락, Sorted Set 랭킹 헬퍼 등 제공 |
| `database` | TypeORM `DataSource` 팩토리 |
| `http` | `axios` 기반 HTTP 클라이언트 (재시도 지원) |
| `events` | `eventemitter2` 기반 이벤트 버스, `@OnEvent` 자동 등록 (NestJS) |
| `metrics` | `prom-client` 기반 메트릭 수집기 |
| `versioning` | 요청 헤더 기반 API 버전 협상 |
| `health` | 의존성 상태 점검 (헬스체크) |

각 모듈의 상세 API는 소스의 JSDoc(`@description`)을 참고하세요.

## 사용 예시

```ts
// 코어만 사용 (프레임워크 무관)
import { ForgeRedisClient, createRedisClient } from '@paikpaik/node-forge/redis'

const redis = createRedisClient({ host: 'localhost', port: 6379 })
await redis.zadd('rank', [{ score: 100, member: 'user:1' }])
```

```ts
// NestJS
import { RedisModule } from '@paikpaik/node-forge/redis/nestjs'

@Module({ imports: [RedisModule.forRoot({ host: 'localhost', port: 6379 })] })
export class AppModule {}
```

```ts
// Fastify
import { fastifyRedis } from '@paikpaik/node-forge/redis/fastify'

fastify.register(fastifyRedis, { host: 'localhost', port: 6379 })
```

## 개발

```bash
npm run build     # tsup: CJS + ESM + .d.ts 생성
npm test          # vitest: src/**/*.test.ts
npm run lint      # eslint src/
npm run format    # prettier src/
```

### 핵심 규칙

- `@nestjs/*`, `fastify`, `typeorm`, `ioredis` 등 프레임워크 의존성은 `peerDependencies`로만 선언합니다.
- 모든 모듈은 tsup으로 CJS + ESM + `.d.ts`를 동시에 빌드합니다(dual output).
- `src/core`는 외부 런타임 의존성이 없는 순수 코드로 유지합니다.
- 코어 index는 프레임워크 코드를 export하지 않습니다(런타임 에러 방지를 위한 프레임워크 격리).

## 퍼블리시

`v*` 형태의 태그를 push하면 GitHub Actions가 테스트 → 빌드 → GitHub Packages 배포를 자동으로 수행합니다.

```bash
git tag v1.0.0
git push origin v1.0.0
```

## 라이선스

[MIT](./LICENSE)
