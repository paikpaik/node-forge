import { Controller, Get, Header, Inject } from '@nestjs/common'
import { ForgeMetrics } from '../metrics'
import { METRICS_INSTANCE } from './metrics.constants'

@Controller()
export class MetricsController {
  constructor(@Inject(METRICS_INSTANCE) private readonly forge: ForgeMetrics) {}

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async metrics(): Promise<string> {
    return this.forge.metrics()
  }
}
