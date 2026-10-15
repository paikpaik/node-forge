# node-forge 제안 — hustle 서버 연동 피드백 (TypeORM 1.x·fastify-plugin 6 peer, forRootAsync 타입, 전체 예외 필터)

## 계기

`hustleServer`(NestJS 12 ESM + Fastify 어댑터 + TypeORM/MySQL + Redis)를 `@paikpaik/node-forge@1.1.0`으로
처음 구성하면서 네 가지가 걸렸다. 넷 다 소비자 쪽에서 우회는 가능했지만, 다음 프로젝트에서도 똑같이 반복될
문제라 node-forge에서 해결한다.

## 1. TypeORM 1.x를 peer로 허용

**현재 한계**: TypeORM 최신 메이저가 1.x(`1.1.2`)인데 peer가 `"typeorm": "^0.3.0"`이라, 새 프로젝트가
TypeORM 1.x를 설치하면 ERESOLVE가 난다. hustleServer는 이 때문에 TypeORM을 0.3으로 내려서 시작했다.

**사전 검증** (`v1.1.0` 사본에서 typeorm만 `1.1.2`로 교체):

| 검증 | 결과 |
|---|---|
| `vitest run` | 497 / 497 통과 (기준선과 동일) |
| `tsc --noEmit -p tsconfig.build.json` | 기존 에러 2건 외 신규 없음 |
| `tsup` 빌드 | 성공 |
| 실제 MySQL 8.4에 `createDataSource` → `runMigrations` → `createDatabaseHealthChecker` | 정상 (`health=ok`) |

node-forge가 쓰는 TypeORM API(`DataSource`, `DataSourceOptions`, `initialize`, `runMigrations`, `query`)는
1.x에서도 그대로라 코드 변경 없이 범위만 넓힌다.

**변경**: `"typeorm": "^0.3.0 || ^1.0.0"`

## 2. fastify-plugin 6을 peer로 허용

**현재 한계**: `@nestjs/platform-fastify@12`는 `fastify-plugin@6`을 쓰는데 node-forge peer가 `^4 || ^5`라,
npm이 node-forge 전용으로 `fastify-plugin@5`와 `fastify`를 한 벌 더 설치했다 (`npm explain fastify-plugin@5`
→ `peer ... from @paikpaik/node-forge`). 중복 설치일 뿐 아니라, node-forge의 Fastify 플러그인과 앱의
Fastify 인스턴스가 서로 다른 패키지 사본을 보게 될 위험이 있다.

참고로 같이 설치되던 `@grpc/grpc-js`는 node-forge가 아니라 `@nestjs/core` → `@nestjs/microservices`의
선택 peer 경로로 들어온 것이라 이번 범위가 아니다.

**사전 검증**: `fastify-plugin@6.0.1`로 교체한 사본에서 vitest 497 / 497 통과(Fastify 플러그인 테스트 포함).

**변경**: `"fastify-plugin": "^4.0.0 || ^5.0.0 || ^6.0.0"`

**결과**: hustleServer 사본에 1.2.0 tarball을 설치하자 중복 패키지 17개가 제거되고 `fastify-plugin@6.0.1` 하나로 정리됨.

## 3. forRootAsync의 useFactory 타입

**현재 한계**: `LoggerModule`/`RedisModule`/`DatabaseModule`/`HttpModule`/`MetricsModule`/`HealthModule`의
`forRootAsync`가 `useFactory: (...args: unknown[]) => ...`로 선언되어 있다. `strictFunctionTypes`에서는
`(config: ConfigService) => ...`가 이 타입에 대입되지 않아서, 소비자가 매번 이렇게 써야 했다.

```ts
useFactory: (...args) => {
  const config = args[0] as ConfigService; // 캐스팅 강제
  ...
}
```

Nest 기본 모듈(`TypeOrmModule.forRootAsync` 등)과 사용법이 달라 헷갈리고, 캐스팅이라 inject 순서가 바뀌어도
컴파일러가 못 잡는다(어차피 Nest `FactoryProvider`도 inject 순서를 타입으로 검증하지 않으므로 손해는 없다).

**변경**: Nest `FactoryProvider`와 같은 시그니처로 맞춘다.

```ts
useFactory: FactoryProvider<LoggerOptions>["useFactory"]; // (...args: any[]) => T | Promise<T>
```

`any`를 직접 쓰지 않고 Nest 타입을 그대로 가져와 ESLint `no-explicit-any` 경고도 없다. 받는 쪽이 더 넓어지는
변경이라 기존 코드(`(...args) => ...`, `(...args: unknown[]) => ...`)는 그대로 컴파일된다.

```ts
// 1.2.0부터
RedisModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({ host: config.get('REDIS_HOST') }),
})
```

## 4. 모든 예외를 표준 포맷으로 — `ForgeAllExceptionsFilter`

**현재 한계**: `ForgeExceptionFilter`는 `@Catch(ForgeBizError, ForgeHttpError)`라, 그 밖의 예외는 Nest 기본
포맷으로 나간다. hustleServer에서 실제로 확인한 응답:

```
GET /nope   → 404 {"message":"Cannot GET /nope","error":"Not Found","statusCode":404}
GET /health → 503 {"status":"error","checks":[...]}         (헬스 실패)
```

성공은 `{ success, data }`인데 실패는 두 가지 포맷이 섞여, 클라이언트(Unity)가 응답 포맷을 여러 개 처리해야 한다.

**변경**: 기존 `ForgeExceptionFilter`는 그대로 두고(동작 변경 없음), 모든 예외를 잡는 필터를 추가한다.

| 예외 | 상태 | code | message |
|---|---|---|---|
| `ForgeHttpError` | 자신의 statusCode | 자신의 code | 그대로 |
| `ForgeBizError` | 400 | 자신의 code | 그대로 (`ForgeExceptionFilter`와 동일) |
| Nest `HttpException` (라우트 없음, ValidationPipe 등) | 유지 | `E9` + 상태 (`404 → E9404`, `503 → E9503`) | 문자열 / `message` / 배열이면 `, `로 합침 |
| 4xx·5xx가 아닌 상태의 `HttpException` (예: 302) | **500** (code와 맞춤) | `E9500` | 위와 같음 |
| 그 외 (예상하지 못한 예외) | 500 | `E9500` | 고정 문구 `Internal server error` (내부 정보 비노출) |

`E9` + 상태 코드 규칙이라 기존 컨벤션(`E94xx` 클라이언트, `E95xx` 서버)에 자연스럽게 들어맞는다.
변환 로직은 `toErrorReply()`, `httpStatusToErrorCode()`, `isExpectedException()`으로 export해서 테스트와
다른 용도(예: Fastify 쪽)에서 재사용할 수 있게 했다.

**로그 정책** — 응답에서 상세를 빼는 대신, 원인은 서버 로그에 남긴다.

| 경우 | 로그 |
|---|---|
| 예상하지 못한 예외 | `error` — 원래 메시지 + 스택 |
| 의도된 예외(Forge 에러, `HttpException`)인데 5xx | `warn` — `상태 code: message` + 응답에서 빠진 상세 (`HttpException` 본문, `ForgeHttpError`의 `cause`) |
| 의도된 4xx | 남기지 않음 (정상 흐름) |

처음 버전은 의도된 예외를 전혀 로그에 남기지 않아서, 헬스체크 503에서 **어떤 체크가 실패했는지가 응답에도
로그에도 남지 않는** 문제가 리뷰에서 나왔다(`HealthController`가 던지는 본문에 `message`가 없어 메시지는
클래스 이름에서 만든 문구가 된다). 외부 API 실패를 감싼 `ForgeHttpError(502, …, cause)`의 `cause`도 같은 이유로
버려지고 있었다. 5xx `warn` 로그로 둘 다 해결한다.

**HTTP가 아닌 컨텍스트** — `connectMicroservice(..., { inheritAppConfig: true })`를 쓰면 전역 필터가 gRPC 등에도
적용되어 `switchToHttp()`가 깨진다. `host.getType() !== "http"`이면 변환하지 않고 `throwError(() => exception)`으로
그대로 돌려준다 (RPC 필터는 Observable을 반환해야 한다).

**함께 바꾼 것**

- `ForgeExceptionFilter`가 `toErrorReply()`에 위임한다. Forge 에러 변환 로직이 한곳에만 있어 두 필터의 동작이 어긋날 수 없다 (동작은 기존과 동일).
- `HealthController`가 실패 시 `new HttpException(report, 503)` 대신 `new ServiceUnavailableException(report)`를 던진다. Nest 기본 포맷의 응답 본문(report)은 그대로라 기존 소비자에게 영향이 없다.

**결과** (hustleServer 사본, 1.2.0 tarball):

```
GET /nope   → 404 {"success":false,"error":{"code":"E9404","message":"Cannot GET /nope"}}

# Redis를 멈춘 상태
GET /health → 503 {"success":false,"error":{"code":"E9503","message":"Service Unavailable Exception"}}
로그 (warn) → 503 E9503: Service Unavailable Exception {"status":"error","checks":[{"name":"database","status":"up"},
              {"name":"redis","status":"down","error":"Redis 서버로부터 PONG 응답을 받지 못했습니다"}]}
```

**알려진 한계**

- 장애가 이어지는 동안 로드밸런서가 `/health`를 호출할 때마다 `warn`이 한 줄씩 남는다. 로그 비용이 문제가 되면
  "상태가 바뀔 때만 기록"하는 방식으로 줄인다.
- 상세 객체 안에 `Error`가 중첩되어 있으면 `JSON.stringify`가 `{}`로 직렬화한다. `cause` 자체가 `Error`인 경우는
  스택으로 남기므로 현재 쓰는 범위에서는 문제없다.

## 버전

모두 하위 호환(범위 확장, 타입 완화, 새 export 추가)이라 `v1.2.0`.

## 검증

| 항목 | 결과 |
|---|---|
| `eslint src` | 경고·에러 없음 |
| `tsc --noEmit -p tsconfig.build.json` | 기존 `events.explorer.ts` 2건 외 신규 없음 |
| `vitest run` | 512 / 512 통과 (신규 `all-exceptions.filter.test.ts` 포함 — 302 정책, 5xx warn 로그, non-HTTP 가드, `isExpectedException`) |
| `npm run build` | 성공 |
| `npm run smoke` (NestJS ^10, ^12) | 통과. 추가한 검증: `ForgeAllExceptionsFilter` require 로딩, core 에러의 엔트리 간 `instanceof`, **typeorm 1.x·fastify-plugin 6 실설치** |
| hustleServer 사본에 tarball 설치 | ERESOLVE 없음, 타입 붙은 `useFactory`로 typecheck·단위·e2e 통과, 404 표준 포맷, Redis 장애 시 503 응답과 warn 로그 확인 |

### peer 범위 회귀 테스트

vitest는 devDependencies(typeorm 0.3, fastify-plugin 5)로 돌기 때문에 **새로 넓힌 최신 메이저는 CI에서 검증되지
않는** 문제가 리뷰에서 나왔다(둘 다 optional peer라 ERESOLVE 검사에도 걸리지 않는다). 역할을 나눠 해결한다.

| 범위 | 검증 위치 |
|---|---|
| 최소 메이저 (typeorm 0.3, fastify-plugin 5) | vitest (devDependencies) |
| 최신 메이저 (typeorm 1.x, fastify-plugin 6) | 스모크 테스트가 소비자 프로젝트에 실제 설치 — typeorm은 `DataSource` API 존재 확인, fastify-plugin 6은 `fastifyHealth`를 실제 Fastify에 등록해 `/health` 응답까지 확인 |

스모크의 typeorm 확인은 DB 없이 돌아야 해서 API 존재 여부까지만 본다. 실제 MySQL 연결은 이 제안서의 1번 사전 검증에서 한 번 확인했다.

## 기각한 대안

- **`ForgeExceptionFilter`를 `@Catch()`로 바꾸기**: 기존 소비자의 동작(Nest 기본 예외는 기본 포맷)이 바뀌는
  변경이라 메이저 업이 필요하다. 별도 필터로 추가해 소비자가 고르게 했다.
- **HttpException의 응답 본문을 그대로 `error`에 싣기**: 헬스체크 리포트, ValidationPipe 상세 등 형태가 제각각이라
  포맷 통일이라는 목적에 어긋난다. 메시지 한 줄만 싣고, 상세가 필요한 엔드포인트는 Forge 에러로 직접 표현한다.
- **헬스 컨트롤러가 `{ message: "unhealthy: redis", ...report }`처럼 message를 넣어 던지기**: 헬스체크 하나만
  고쳐지고, 같은 문제를 가진 `ForgeHttpError`의 `cause`는 그대로 버려진다. 필터에서 5xx 상세를 로그로 남기는 쪽이
  두 경우를 한 번에 해결한다.
- **`useFactory`를 inject 토큰별로 타입 추론하는 제네릭**: Nest 자체도 하지 않는 수준의 타입 체조라 유지 비용 대비
  이득이 작다. Nest와 같은 시그니처로 맞추는 쪽을 택했다.

## 상태

`feature/TSK-1`에 반영 완료(리뷰 반영: 5xx warn 로그, non-HTTP 가드, 302 정책, 변환 로직 단일화, peer 최신
메이저 스모크), 배포(`v1.2.0` 태그) 대기. 배포되면 hustleServer를 1.2.0으로 올리면서
TypeORM 1.x 전환, `configFrom` 캐스팅 제거, `ForgeAllExceptionsFilter` 적용을 함께 한다.
