import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { ForgeEventBus } from '../events'
import type { EventBusOptions } from '../events'

declare module 'fastify' {
  interface FastifyInstance {
    events: ForgeEventBus
  }
}

const eventsPlugin: FastifyPluginAsync<EventBusOptions> = async (fastify, options) => {
  const eventBus = new ForgeEventBus(options)

  fastify.decorate('events', eventBus)

  fastify.addHook('onClose', () => {
    eventBus.removeAllListeners()
  })
}

export const fastifyEvents = fp(eventsPlugin, {
  name: '@paikpaik/node-forge/events',
})
