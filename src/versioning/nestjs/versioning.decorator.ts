import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { resolveVersion, DEFAULT_HEADER_NAME } from '../versioning'
import type { VersionOptions, VersionResolution } from '../versioning'

/**
 * @description 요청의 Accept-Version 헤더(기본값, options.headerName으로 변경 가능)를 읽어
 * resolveVersion으로 협상한 결과를 핸들러 인자로 주입하는 파라미터 데코레이터.
 * options(defaultVersion/supportedVersions)는 호출 시점에 명시적으로 전달한다 — node-forge는
 * 서비스별 최신/지원 버전을 알 수 없으므로 등록 시점에 전역으로 받지 않는다.
 *
 * @example
 * findAll(@ApiVersion({ defaultVersion: 'v2', supportedVersions: ['v1', 'v2'] }) version: VersionResolution)
 */
export const ApiVersion = createParamDecorator(
  (options: VersionOptions, ctx: ExecutionContext): VersionResolution => {
    const request = ctx.switchToHttp().getRequest()
    const headerName = options.headerName ?? DEFAULT_HEADER_NAME
    const headerValue = request.headers[headerName]
    return resolveVersion(headerValue, options)
  },
)
