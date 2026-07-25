export interface GrpcTargetOptions {
  packageName: string;
  protoPath: string;
  target: string;
  /** 기본값 round_robin. 단일 인스턴스로 고정해야 하는 특수 케이스를 위해 pick_first를 열어둔다 */
  loadBalancing?: "round_robin" | "pick_first";
}
