import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { resolveVersion, DEFAULT_HEADER_NAME } from "../versioning";
import type { VersionOptions, VersionResolution } from "../versioning";

declare module "fastify" {
  interface FastifyRequest {
    getApiVersion(options: VersionOptions): VersionResolution;
  }
}

const versioningPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest("getApiVersion", {
    getter(this: FastifyRequest): (options: VersionOptions) => VersionResolution {
      return (options: VersionOptions): VersionResolution => {
        const headerName = options.headerName ?? DEFAULT_HEADER_NAME;
        return resolveVersion(this.headers[headerName], options);
      };
    },
  });
};

/**
 * @description 요청의 Accept-Version 헤더(기본값, options.headerName으로 변경 가능)를 협상해주는
 * request.getApiVersion(options) 메서드를 등록하는 플러그인.
 * options(defaultVersion/supportedVersions)는 호출 시점에 명시적으로 전달한다 — node-forge는
 * 서비스별 최신/지원 버전을 알 수 없으므로 등록 시점에 전역으로 받지 않는다.
 *
 * @example
 * fastify.get('/items', async (request) => {
 *   const v = request.getApiVersion({ defaultVersion: 'v2', supportedVersions: ['v1', 'v2'] })
 *   return v.resolved === 'v1' ? legacyHandler() : handler()
 * })
 */
export const fastifyVersioning = fp(versioningPlugin, {
  name: "@paikpaik/node-forge/versioning",
});
