import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import type { DataSource } from 'typeorm'
import { createDataSource } from '../database'
import type { DatabaseOptions } from '../database'

declare module 'fastify' {
  interface FastifyInstance {
    db: DataSource
  }
}

/**
 * @description `DataSource`를 생성·초기화해 `fastify.db`로 데코레이트한다. 앱 종료(`onClose`)
 * 시 연결을 자동으로 `destroy()`하므로, 커넥션 누수 없이 그레이스풀 셧다운을 보장한다
 * (NestJS의 `DatabaseModule.forRoot`와 동일한 라이프사이클 관리를 Fastify 방식으로 제공).
 */
const databasePlugin: FastifyPluginAsync<DatabaseOptions> = async (fastify, options) => {
  const dataSource = createDataSource(options)
  await dataSource.initialize()

  fastify.decorate('db', dataSource)

  fastify.addHook('onClose', async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy()
    }
  })
}

/**
 * @description `databasePlugin`을 `fastify-plugin`으로 감싸 캡슐화를 해제한 플러그인.
 * `fastify.register(fastifyDatabase, options)`로 등록하면 `fastify.db`를 즉시 사용할 수 있다.
 */
export const fastifyDatabase = fp(databasePlugin, {
  name: '@paikpaik/node-forge/database',
})
