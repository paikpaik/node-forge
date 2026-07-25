import { describe, it, expect } from "vitest";
import { buildGrpcClientChannelOptions, buildGrpcClientUrl } from "./grpc";

describe("buildGrpcClientChannelOptions", () => {
  it("옵션을 생략하면 round_robin LB policy를 기본으로 넣는다", () => {
    const options = buildGrpcClientChannelOptions({});

    expect(JSON.parse(options["grpc.service_config"] as string)).toEqual({
      loadBalancingConfig: [{ round_robin: {} }],
    });
  });

  it("loadBalancing: pick_first를 명시하면 기존 grpc-js 기본 동작으로 되돌린다", () => {
    const options = buildGrpcClientChannelOptions({ loadBalancing: "pick_first" });

    expect(JSON.parse(options["grpc.service_config"] as string)).toEqual({
      loadBalancingConfig: [{ pick_first: {} }],
    });
  });
});

describe("buildGrpcClientUrl", () => {
  it("타깃 앞에 dns:/// 스킴을 붙인다", () => {
    expect(buildGrpcClientUrl("inventory-service:50053")).toBe(
      "dns:///inventory-service:50053",
    );
  });
});
