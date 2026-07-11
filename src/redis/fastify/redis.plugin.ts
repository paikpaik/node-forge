import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { ForgeRedisClient } from "../redis";
import type { RedisOptions } from "../redis.options";

declare module "fastify" {
  interface FastifyInstance {
    redis: ForgeRedisClient;
  }
}

const redisPlugin: FastifyPluginAsync<RedisOptions> = async (fastify, options) => {
  const client = new ForgeRedisClient(options);

  fastify.decorate("redis", client);

  fastify.addHook("onClose", async () => {
    await client.disconnect();
  });
};

export const fastifyRedis = fp(redisPlugin, {
  name: "@paikpaik/node-forge/redis",
});
