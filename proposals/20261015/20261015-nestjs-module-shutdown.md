# node-forge 버그 — NestJS RedisModule·DatabaseModule이 앱 종료 시 연결을 닫지 않음 (프로세스 미종료)

## 계기

hustleServer에 초기 config 등록 스크립트(`NestFactory.createApplicationContext(AppModule)` → 작업 → `app.close()`)를
만들었는데, 작업은 끝났는데 **프로세스가 끝나지 않고 멈췄다.** `app.close()` 뒤에도 Redis 연결이 이벤트 루프를
붙잡고 있었다. 운영 서버에서는 배포 시 종료 신호(SIGTERM)를 받아도 정상 종료(graceful shutdown)가 끝나지 않고,
오케스트레이터가 강제 종료(SIGKILL)할 때까지 기다리게 되는 문제다.

## 현재 한계 (버그)

연결을 만드는 NestJS 모듈 두 개 모두 종료 훅이 없다.

| 모듈 | 만드는 연결 | 앱 종료 시 | Fastify 플러그인 |
|---|---|---|---|
| `RedisModule` | ioredis 연결 (+ pub/sub 전용 연결) | 닫지 않음 | `onClose`에서 `disconnect()` |
| `DatabaseModule` | TypeORM `DataSource` 연결 풀 | 닫지 않음 | `onClose`에서 `destroy()` |

Fastify 플러그인은 둘 다 닫는데 NestJS 모듈만 빠져 있다. `database.plugin.ts`의 JSDoc에는
"NestJS의 `DatabaseModule.forRoot`와 동일한 라이프사이클 관리"라고 적혀 있어 문서와 동작도 어긋나 있었다.

hustleServer에서 Redis 쪽만 드러난 이유는, DB 연결은 node-forge가 아니라 `@nestjs/typeorm`(자체 종료 훅 있음)으로
만들었기 때문이다.

## 변경

두 모듈 클래스가 `OnApplicationShutdown`을 구현해 자기 연결을 닫는다.

```ts
@Global()
@Module({})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly client: ForgeRedisClient) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.disconnect(); // pub/sub 전용 연결도 함께 닫힌다
  }
}

export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_DATA_SOURCE) private readonly dataSource: DataSource) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.dataSource.isInitialized) {
      await this.dataSource.destroy();
    }
  }
}
```

- `onApplicationShutdown`은 HTTP 서버가 닫힌 뒤(진행 중인 요청이 끝난 뒤) 호출되므로, 처리 중인 명령을 끊지 않는다.
- 주입 토큰을 `@Inject()`로 명시한다 — esbuild(tsup)가 `design:paramtypes`를 방출하지 않기 때문 (20260725 RolesGuard 버그와 같은 이유).
- 별도 프로바이더를 추가하지 않고 모듈 클래스에 훅을 둔다 (`@nestjs/typeorm`의 `TypeOrmCoreModule`과 같은 방식). 공개 API 변화 없음.

**버전**: 동작 수정(버그 픽스)이라 `v1.2.1`.

## 검증

### 단위 테스트 (vitest) — 실제 Nest 앱 생명주기

연결(ForgeRedisClient, DataSource)만 가짜로 바꾸고 `NestFactory.createApplicationContext()` → `app.close()`를 실제로
돌려 훅이 호출되는지 확인한다 (`redis.module.test.ts` 2개, `database.module.test.ts` 3개).

**수정 전 코드로 되돌려 돌리면 4개가 실패**한다 (나머지 1개는 "이미 닫힌 연결은 다시 닫지 않는다"로 원래 통과가 맞음).
테스트가 이 버그를 실제로 잡는다는 확인.

### 스모크 테스트 — 빌드된 패키지로 "프로세스가 끝나는가"

`check-redis-shutdown.cjs`: 앱을 띄우고 닫은 뒤 프로세스가 20초 안에 끝나지 않으면 `execFileSync` timeout으로 실패.

처음에는 접속할 수 없는 Redis 주소로 만들었는데, **1.2.0에서도 바로 끝나서 버그를 잡지 못했다.**
`ForgeRedisClient`가 `lazyConnect: true`라 명령을 보내기 전에는 연결 자체가 없기 때문이다. 그래서 검사 안에
최소한의 가짜 Redis(TCP 서버, ioredis 준비 확인용 `INFO`와 `PING`에만 응답)를 띄우고 `PING`으로 연결을 맺은 뒤
닫도록 바꿨다. 클라이언트가 연결을 닫지 않으면 서버 쪽 소켓이 남아 프로세스가 끝나지 않는다.

| 대상 | 결과 |
|---|---|
| 1.2.0 (hustleServer에 설치된 버전) | `app.close()` 후 10초 제한까지 멈춤 → 강제 종료(142) — **버그 재현** |
| 1.2.1 빌드 (스모크, NestJS ^10, ^12) | 통과 |

`DatabaseModule`은 CI에 DB가 없어 스모크 대신 단위 테스트로만 검증한다.

### 전체

| 항목 | 결과 |
|---|---|
| `eslint src` | 경고·에러 없음 |
| `tsc --noEmit -p tsconfig.build.json` | 기존 `events.explorer.ts` 2건 외 신규 없음 |
| `vitest run` | 517 / 517 통과 (신규 5개) |
| `npm run smoke` (NestJS ^10, ^12) | 통과 (신규 Redis 종료 검증 포함) |

## 기각한 대안

- **`quit()`(대기 중 명령을 마저 처리한 뒤 종료)로 닫기**: `ForgeRedisClient.disconnect()`와 Fastify 플러그인이 이미
  `disconnect()`를 쓰고, `onApplicationShutdown` 시점에는 HTTP 요청이 끝나 있어 차이가 거의 없다. 두 프레임워크
  어댑터의 동작을 같게 두는 쪽을 택했다.
- **소비자에게 종료 훅을 직접 만들게 하기 (README 안내)**: hustleServer가 실제로 이렇게 우회했는데, 모든 소비자가
  같은 코드를 반복해야 하고 잊으면 운영에서만 드러난다. 연결을 만든 모듈이 닫는 게 맞다.

## 상태

`feature/TSK-1`에 반영 완료, 배포(`v1.2.1` 태그) 대기. 배포되면 hustleServer의 우회 코드(`src/infra/redis-shutdown.ts`)를
지우고 1.2.1로 올린다.
