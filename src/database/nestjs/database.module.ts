import { Module, Global, Inject } from "@nestjs/common";
import type {
  DynamicModule,
  FactoryProvider,
  ModuleMetadata,
  OnApplicationShutdown,
} from "@nestjs/common";
import type { DataSource } from "typeorm";
import { createDataSource } from "../database";
import type { DatabaseOptions } from "../database";
import { DATABASE_DATA_SOURCE, DATABASE_OPTIONS } from "./database.constants";

export interface DatabaseAsyncOptions extends Pick<ModuleMetadata, "imports"> {
  /** Nest `FactoryProvider`와 같은 시그니처 — `inject` 순서대로 들어오는 인자에 타입을 바로 적을 수 있다 */
  useFactory: FactoryProvider<DatabaseOptions>["useFactory"];
  inject?: FactoryProvider["inject"];
}

/**
 * @description TypeORM `DataSource`를 `DATABASE_DATA_SOURCE` 토큰으로 전역 등록하는 동적 모듈.
 * 프로바이더 생성 시 `initialize()`까지 자동으로 호출해주므로, 사용하는 쪽은 연결 상태를
 * 신경 쓰지 않고 바로 주입받아 사용할 수 있다. `@Global()`이므로 한 번만 등록하면 된다.
 * 앱이 종료될 때 `destroy()`로 연결 풀을 닫는다 (Fastify 플러그인의 `onClose`와 같은 라이프사이클).
 */
@Global()
@Module({})
export class DatabaseModule implements OnApplicationShutdown {
  // esbuild(tsup)는 design:paramtypes를 방출하지 않으므로 주입 토큰을 명시한다
  constructor(@Inject(DATABASE_DATA_SOURCE) private readonly dataSource: DataSource) {}

  /**
   * @description 연결 풀을 닫는다. 초기화에 실패했거나 이미 닫힌 경우는 건너뛴다.
   */
  async onApplicationShutdown(): Promise<void> {
    if (this.dataSource.isInitialized) {
      await this.dataSource.destroy();
    }
  }

  /**
   * @description 정적인 `DatabaseOptions`(TypeORM `DataSourceOptions`)로 모듈을 구성한다.
   */
  static forRoot(options: DatabaseOptions): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        { provide: DATABASE_OPTIONS, useValue: options },
        {
          provide: DATABASE_DATA_SOURCE,
          useFactory: async (opts: DatabaseOptions) => {
            const dataSource = createDataSource(opts);
            await dataSource.initialize();
            return dataSource;
          },
          inject: [DATABASE_OPTIONS],
        },
      ],
      exports: [DATABASE_DATA_SOURCE],
    };
  }

  /**
   * @description 다른 모듈(예: `ConfigModule`)에서 비동기로 가져온 접속 정보로
   * `DatabaseOptions`를 구성해야 할 때 사용한다.
   */
  static forRootAsync(asyncOptions: DatabaseAsyncOptions): DynamicModule {
    return {
      module: DatabaseModule,
      imports: asyncOptions.imports ?? [],
      providers: [
        {
          provide: DATABASE_OPTIONS,
          useFactory: asyncOptions.useFactory,
          inject: asyncOptions.inject ?? [],
        },
        {
          provide: DATABASE_DATA_SOURCE,
          useFactory: async (opts: DatabaseOptions) => {
            const dataSource = createDataSource(opts);
            await dataSource.initialize();
            return dataSource;
          },
          inject: [DATABASE_OPTIONS],
        },
      ],
      exports: [DATABASE_DATA_SOURCE],
    };
  }
}
