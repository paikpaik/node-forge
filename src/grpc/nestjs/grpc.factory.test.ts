import { describe, it, expect } from "vitest";
import { Transport } from "@nestjs/microservices";
import { createGrpcClientOptions, createGrpcServerOptions } from "./grpc.factory";

describe("createGrpcClientOptions", () => {
  it("dns:/// URL과 round_robin channelOptions을 기본으로 담은 GrpcOptions를 만든다", () => {
    const options = createGrpcClientOptions({
      packageName: "inventory",
      protoPath: "/proto/inventory.proto",
      target: "inventory-service:50053",
    });

    expect(options.transport).toBe(Transport.GRPC);
    expect(options.options).toMatchObject({
      package: "inventory",
      protoPath: "/proto/inventory.proto",
      url: "dns:///inventory-service:50053",
    });
    expect(
      JSON.parse(options.options.channelOptions?.["grpc.service_config"] as string),
    ).toEqual({ loadBalancingConfig: [{ round_robin: {} }] });
  });

  it("loadBalancing: pick_first를 지정하면 그대로 반영한다", () => {
    const options = createGrpcClientOptions({
      packageName: "inventory",
      protoPath: "/proto/inventory.proto",
      target: "inventory-service:50053",
      loadBalancing: "pick_first",
    });

    expect(
      JSON.parse(options.options.channelOptions?.["grpc.service_config"] as string),
    ).toEqual({ loadBalancingConfig: [{ pick_first: {} }] });
  });
});

describe("createGrpcServerOptions", () => {
  it("package/protoPath/url만 담은 MicroserviceOptions를 만든다", () => {
    const options = createGrpcServerOptions({
      packageName: "inventory",
      protoPath: "/proto/inventory.proto",
      url: "0.0.0.0:50053",
    });

    expect(options).toEqual({
      transport: Transport.GRPC,
      options: {
        package: "inventory",
        protoPath: "/proto/inventory.proto",
        url: "0.0.0.0:50053",
      },
    });
  });
});
