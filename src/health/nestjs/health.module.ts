import { Module } from '@nestjs/common'
import type { DynamicModule } from '@nestjs/common'
import type { HealthChecker } from '../health'
import { HealthController } from './health.controller'
import { HEALTH_CHECKERS } from './health.constants'

export interface HealthModuleOptions {
  checkers: Record<string, HealthChecker>
}

/**
 * @description `GET /health` 엔드포인트를 등록하는 동적 모듈. `forRoot`에 전달한 체커들이
 * `HealthController`에 주입되어 매 요청마다 실행된다. `LoggerModule`/`MetricsModule`과 달리
 * `@Global()`이 아니므로, 사용할 모듈에서 직접 import한다 (체커는 `database`/`redis` 같은
 * 다른 모듈의 인스턴스에 의존하므로 전역으로 미리 구성하기 어렵기 때문).
 */
@Module({})
export class HealthModule {
  static forRoot(options: HealthModuleOptions): DynamicModule {
    return {
      module: HealthModule,
      controllers: [HealthController],
      providers: [{ provide: HEALTH_CHECKERS, useValue: options.checkers }],
    }
  }
}
