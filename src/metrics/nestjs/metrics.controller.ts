import { Controller, Get, Header, Inject } from '@nestjs/common'
import { ForgeMetrics } from '../metrics'
import { METRICS_INSTANCE } from './metrics.constants'

/**
 * @description Prometheus가 스크래핑할 `GET /metrics` 엔드포인트를 제공하는 컨트롤러.
 * `ForgeMetrics.metrics()`의 결과를 Prometheus 텍스트 포맷의 `Content-Type`으로 응답한다.
 * `MetricsModule`에 등록하면 별도 라우트 작성 없이 바로 사용할 수 있다.
 */
@Controller()
export class MetricsController {
  constructor(@Inject(METRICS_INSTANCE) private readonly forge: ForgeMetrics) {}

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async metrics(): Promise<string> {
    return this.forge.metrics()
  }
}
