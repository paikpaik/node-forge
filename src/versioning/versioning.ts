/**
 * @description 버전 협상에 필요한 옵션. 호출자가 자신의 서비스 기준으로 직접 전달한다.
 * node-forge는 "무엇이 최신/지원 버전인지" 알 수 없으므로 등록 시점이 아닌 호출 시점에 받는다.
 */
export interface VersionOptions {
  defaultVersion: string
  supportedVersions?: string[]
  /**
   * 어떤 헤더에서 버전 값을 읽을지 (기본 'accept-version').
   * resolveVersion은 이미 추출된 값을 받으므로 이 옵션을 직접 사용하지 않는다 — NestJS/Fastify
   * 어댑터가 요청에서 헤더를 꺼낼 때 참조한다. 두 계층이 같은 옵션 객체를 공유하도록 하기 위함.
   */
  headerName?: string
}

/**
 * @description 버전 협상 결과. requested는 클라이언트가 보낸 원본 값(없으면 null),
 * resolved는 실제로 사용할 최종 버전, isFallback은 헤더 부재 또는 미지원으로 인해
 * defaultVersion으로 대체되었는지를 나타낸다.
 */
export interface VersionResolution {
  requested: string | null
  resolved: string
  isFallback: boolean
}

export const DEFAULT_HEADER_NAME = 'accept-version'

/**
 * @description Accept-Version 헤더 값을 파싱해 최종적으로 사용할 API 버전을 결정한다.
 * 헤더가 없거나, supportedVersions가 주어졌는데 요청 버전이 그 목록에 없으면
 * defaultVersion으로 폴백하고 isFallback을 true로 표시한다.
 * 중복 헤더로 배열이 들어오는 경우 첫 번째 값만 사용한다.
 * 호출자는 반환된 resolved 값으로 실제 라우팅/핸들러 분기를 직접 수행한다.
 */
export function resolveVersion(
  headerValue: string | string[] | undefined | null,
  options: VersionOptions,
): VersionResolution {
  const requested = Array.isArray(headerValue) ? (headerValue[0] ?? null) : (headerValue ?? null)

  if (requested === null) {
    return { requested: null, resolved: options.defaultVersion, isFallback: true }
  }

  if (options.supportedVersions && !options.supportedVersions.includes(requested)) {
    return { requested, resolved: options.defaultVersion, isFallback: true }
  }

  return { requested, resolved: requested, isFallback: false }
}
