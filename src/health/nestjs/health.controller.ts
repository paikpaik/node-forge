import { Controller, Get, HttpException, HttpStatus, Inject, Optional } from "@nestjs/common";
import { checkHealth } from "../health";
import type { HealthChecker, HealthReport } from "../health";
import { HEALTH_CHECKERS, HEALTH_CACHE_MS } from "./health.constants";

/**
 * @description `GET /health` 엔드포인트를 제공하는 컨트롤러. `HealthModule.forRoot`에 등록한
 * 체커들을 실행해 `HealthReport`를 만들고, 하나라도 비정상이면 `503 Service Unavailable`로
 * 응답한다 (로드밸런서/오케스트레이터가 비정상 인스턴스를 트래픽에서 제외할 수 있도록).
 */
@Controller()
export class HealthController {
  constructor(
    @Inject(HEALTH_CHECKERS) private readonly checkers: Record<string, HealthChecker>,
    @Optional() @Inject(HEALTH_CACHE_MS) private readonly cacheMs?: number,
  ) {}

  @Get("health")
  async check(): Promise<HealthReport> {
    const report = await checkHealth(this.checkers, { cacheMs: this.cacheMs });

    if (report.status === "error") {
      throw new HttpException(report, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return report;
  }
}
