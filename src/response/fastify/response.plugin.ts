import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { ok, fail } from "../response";
import type { ApiResponse } from "../response";
import type { PaginationMeta } from "../../core";

declare module "fastify" {
  interface FastifyReply {
    ok<T>(data: T): FastifyReply;
    fail(code: string, message: string): FastifyReply;
    paginated<T>(data: T[], meta: PaginationMeta): FastifyReply;
  }
}

/**
 * @description `FastifyReply`에 `ok`/`fail`/`paginated` 메서드를 데코레이트해, 컨트롤러에서
 * `reply.ok(data)`처럼 표준 `ApiResponse` 포맷으로 바로 응답할 수 있게 한다.
 * 각 메서드는 핵심 모듈의 동명 함수로 응답 바디를 만든 뒤 `reply.send`로 전송한다.
 */
const responsePlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateReply("ok", function <T>(this: FastifyReply, data: T): FastifyReply {
    return this.send(ok(data));
  });

  fastify.decorateReply(
    "fail",
    function (this: FastifyReply, code: string, message: string): FastifyReply {
      return this.send(fail(code, message));
    },
  );

  fastify.decorateReply("paginated", function <
    T,
  >(this: FastifyReply, data: T[], meta: PaginationMeta): FastifyReply {
    return this.send({ success: true, data, meta } as ApiResponse<T[]>);
  });
};

/**
 * @description `responsePlugin`을 `fastify-plugin`으로 감싸 캡슐화를 해제한 플러그인.
 * `fastify.register(fastifyResponse)`로 등록하면 모든 라우트의 `reply`에서
 * `ok`/`fail`/`paginated` 데코레이터를 사용할 수 있다.
 */
export const fastifyResponse = fp(responsePlugin, {
  name: "@paikpaik/node-forge/response",
});
