import { DataSource } from "typeorm";
import type { DataSourceOptions } from "typeorm";

export type DatabaseOptions = DataSourceOptions;

/**
 * @description TypeORM `DataSource`를 생성하는 팩토리. `options`는 TypeORM의
 * `DataSourceOptions`를 그대로 사용하므로, node-forge는 별도 설정 포맷 없이 TypeORM 설정을
 * 그대로 재사용할 수 있다 (단, `initialize()`는 직접 호출해야 한다).
 */
export function createDataSource(options: DatabaseOptions): DataSource {
  return new DataSource(options);
}

/**
 * @description 마이그레이션을 실행한다. `dataSource`가 아직 초기화되지 않았으면 먼저
 * `initialize()`를 호출해주므로, 호출하는 쪽에서 초기화 여부를 신경 쓰지 않아도 된다
 * (앱 부트스트랩 단계나 배포 스크립트에서 사용).
 */
export async function runMigrations(dataSource: DataSource): Promise<void> {
  if (!dataSource.isInitialized) {
    await dataSource.initialize();
  }
  await dataSource.runMigrations();
}
