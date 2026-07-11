import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { ForgeEventBus } from "../events";
import type { EventBusOptions } from "../events";

declare module "fastify" {
  interface FastifyInstance {
    events: ForgeEventBus;
  }
}

/**
 * @description `ForgeEventBus`를 생성해 `fastify.events`로 데코레이트한다. 앱 종료(`onClose`)
 * 시 모든 리스너를 자동으로 정리해, 재시작/테스트 환경에서 리스너가 누적되는 것을 방지한다.
 */
const eventsPlugin: FastifyPluginAsync<EventBusOptions> = async (fastify, options) => {
  const eventBus = new ForgeEventBus(options);

  fastify.decorate("events", eventBus);

  fastify.addHook("onClose", () => {
    eventBus.removeAllListeners();
  });
};

/**
 * @description `eventsPlugin`을 `fastify-plugin`으로 감싸 캡슐화를 해제한 플러그인.
 * `fastify.register(fastifyEvents, options)`로 등록하면 `fastify.events`를 즉시 사용할 수 있다.
 */
export const fastifyEvents = fp(eventsPlugin, {
  name: "@paikpaik/node-forge/events",
});
