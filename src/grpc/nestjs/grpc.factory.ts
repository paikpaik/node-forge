import { Transport } from "@nestjs/microservices";
import type { GrpcOptions, MicroserviceOptions } from "@nestjs/microservices";
import { buildGrpcClientChannelOptions, buildGrpcClientUrl } from "../grpc";
import type { GrpcTargetOptions } from "../grpc.options";

/**
 * @description `ClientsModule.register([{ name: TOKEN, ...createGrpcClientOptions(options) }])`
 * 형태로 쓰는 gRPC 클라이언트 옵션을 만든다. `dns:///` 스킴과 round_robin(기본값)
 * `channelOptions`을 항상 넣어, 클라이언트가 여러 인스턴스로 resolve되는 타깃에서도
 * 트래픽을 고르게 분산시킨다. 주입 토큰(`name`)은 서비스마다 다르므로 이 함수의 책임이 아니다.
 */
export function createGrpcClientOptions(options: GrpcTargetOptions): GrpcOptions {
  return {
    transport: Transport.GRPC,
    options: {
      package: options.packageName,
      protoPath: options.protoPath,
      url: buildGrpcClientUrl(options.target),
      channelOptions: buildGrpcClientChannelOptions({ loadBalancing: options.loadBalancing }),
    },
  };
}

/**
 * @description `NestFactory.createMicroservice`/`app.connectMicroservice`에 바로 넘길 수 있는
 * gRPC 서버 옵션을 만든다. 로드밸런싱은 클라이언트가 여러 서버 인스턴스 중 고르는 개념이라
 * 서버 옵션에는 넣지 않는다.
 */
export function createGrpcServerOptions(
  options: Omit<GrpcTargetOptions, "target" | "loadBalancing"> & { url: string },
): MicroserviceOptions {
  return {
    transport: Transport.GRPC,
    options: {
      package: options.packageName,
      protoPath: options.protoPath,
      url: options.url,
    },
  };
}
