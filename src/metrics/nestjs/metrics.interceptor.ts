import { Injectable, Inject } from '@nestjs/common'
import type { NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import type { Observable } from 'rxjs'
import { tap, catchError } from 'rxjs/operators'
import type { Counter, Histogram } from 'prom-client'
import { ForgeMetrics } from '../metrics'
import { METRICS_INSTANCE } from './metrics.constants'

const HTTP_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]

/**
 * @description 인바운드 HTTP 요청의 처리 시간과 상태 코드를 `ForgeMetrics`에 자동으로 기록하는
 * 인터셉터. `http_requests_total{method,route,status}` counter와
 * `http_request_duration_seconds{method,route,status}` histogram을 등록하며, 앱 전체에
 * 적용하려면 `AppModule`의 `providers`에 `{ provide: APP_INTERCEPTOR, useClass: MetricsInterceptor }`
 * 를 추가한다. `route` 라벨에는 등록된 경로 패턴(예: `/users/:id`)을 사용하므로
 * 카디널리티 폭발 없이 서비스 단위 지표를 추적할 수 있다.
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  private readonly requestsTotal: Counter<'method' | 'route' | 'status'>
  private readonly requestDuration: Histogram<'method' | 'route' | 'status'>

  constructor(@Inject(METRICS_INSTANCE) metrics: ForgeMetrics) {
    this.requestsTotal = metrics.counter({
      name: 'http_requests_total',
      help: '인바운드 HTTP 요청 수',
      labelNames: ['method', 'route', 'status'],
    })
    this.requestDuration = metrics.histogram({
      name: 'http_request_duration_seconds',
      help: '인바운드 HTTP 요청 처리 시간 (초)',
      labelNames: ['method', 'route', 'status'],
      buckets: HTTP_BUCKETS,
    })
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const start = Date.now()
    const req = context.switchToHttp().getRequest<{ method: string; route?: { path: string }; url: string }>()
    const res = context.switchToHttp().getResponse<{ statusCode: number }>()
    const method = req.method
    const route = req.route?.path ?? req.url ?? 'unknown'

    return next.handle().pipe(
      tap(() => this.record(method, route, String(res.statusCode), start)),
      catchError((err: unknown) => {
        const status = String((err as { status?: number }).status ?? 500)
        this.record(method, route, status, start)
        throw err
      }),
    )
  }

  private record(method: string, route: string, status: string, startMs: number): void {
    const duration = (Date.now() - startMs) / 1000
    this.requestsTotal.labels({ method, route, status }).inc()
    this.requestDuration.labels({ method, route, status }).observe(duration)
  }
}
