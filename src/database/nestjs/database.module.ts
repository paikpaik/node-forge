import { Module, Global } from '@nestjs/common'
import type { DynamicModule, FactoryProvider, ModuleMetadata } from '@nestjs/common'
import { createDataSource } from '../database'
import type { DatabaseOptions } from '../database'
import { DATABASE_DATA_SOURCE, DATABASE_OPTIONS } from './database.constants'

export interface DatabaseAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  useFactory: (...args: unknown[]) => DatabaseOptions | Promise<DatabaseOptions>
  inject?: FactoryProvider['inject']
}

@Global()
@Module({})
export class DatabaseModule {
  static forRoot(options: DatabaseOptions): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        { provide: DATABASE_OPTIONS, useValue: options },
        {
          provide: DATABASE_DATA_SOURCE,
          useFactory: async (opts: DatabaseOptions) => {
            const dataSource = createDataSource(opts)
            await dataSource.initialize()
            return dataSource
          },
          inject: [DATABASE_OPTIONS],
        },
      ],
      exports: [DATABASE_DATA_SOURCE],
    }
  }

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
            const dataSource = createDataSource(opts)
            await dataSource.initialize()
            return dataSource
          },
          inject: [DATABASE_OPTIONS],
        },
      ],
      exports: [DATABASE_DATA_SOURCE],
    }
  }
}
