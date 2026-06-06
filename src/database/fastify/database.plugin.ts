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

export const fastifyDatabase = fp(databasePlugin, {
  name: '@paikpaik/node-forge/database',
})
