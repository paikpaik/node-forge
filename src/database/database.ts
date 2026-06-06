import { DataSource } from 'typeorm'
import type { DataSourceOptions } from 'typeorm'

export type DatabaseOptions = DataSourceOptions

export function createDataSource(options: DatabaseOptions): DataSource {
  return new DataSource(options)
}

export async function runMigrations(dataSource: DataSource): Promise<void> {
  if (!dataSource.isInitialized) {
    await dataSource.initialize()
  }
  await dataSource.runMigrations()
}
