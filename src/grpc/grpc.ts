import type { GrpcTargetOptions } from "./grpc.options";

/**
 * @description grpc-js 채널에 round_robin LB policy를 강제하는 `grpc.service_config`를 만든다.
 * grpc-js의 기본 정책(`pick_first`)은 같은 호스트명이 여러 IP로 resolve돼도 처음 연결에
 * 성공한 인스턴스 하나에 고정되어, 스케일아웃한 나머지 인스턴스가 트래픽을 못 받는 조용한
 * 버그로 이어진다.
 */
export function buildGrpcClientChannelOptions(
  options: Pick<GrpcTargetOptions, "loadBalancing">,
): Record<string, unknown> {
  const loadBalancing = options.loadBalancing ?? "round_robin";
  return {
    "grpc.service_config": JSON.stringify({
      loadBalancingConfig: [{ [loadBalancing]: {} }],
    }),
  };
}

/**
 * @description `dns:///` 스킴을 적용한 gRPC 타깃 URL을 만든다. grpc-js가 DNS resolver를
 * 명시적으로 타도록 강제해, 일반 `host:port` 형식에서는 놓칠 수 있는 다중 A 레코드를 인지하게 한다.
 */
export function buildGrpcClientUrl(target: string): string {
  return `dns:///${target}`;
}
