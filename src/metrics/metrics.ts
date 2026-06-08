import {
  Registry,
  Counter,
  Gauge,
  Histogram,
  Summary,
  collectDefaultMetrics,
} from 'prom-client'
import type {
  CounterConfiguration,
  GaugeConfiguration,
  HistogramConfiguration,
  SummaryConfiguration,
} from 'prom-client'

export interface MetricsOptions {
  prefix?: string
  defaultMetrics?: boolean
  labels?: Record<string, string>
}

/**
 * @description `prom-client`를 감싼 메트릭 수집기. 자체 `Registry`를 갖고 있어 여러
 * `ForgeMetrics` 인스턴스를 독립적으로 운용할 수 있으며, `options.defaultMetrics`가
 * false가 아니면 Node.js 프로세스 기본 메트릭(CPU, 메모리, GC 등)을 자동 수집한다.
 * `counter`/`gauge`/`histogram`/`summary`로 만든 지표는 모두 이 레지스트리에 등록된다.
 */
export class ForgeMetrics {
  readonly registry: Registry

  constructor(options: MetricsOptions = {}) {
    this.registry = new Registry()

    if (options.labels) {
      this.registry.setDefaultLabels(options.labels)
    }

    if (options.defaultMetrics !== false) {
      collectDefaultMetrics({
        register: this.registry,
        prefix: options.prefix,
      })
    }
  }

  /**
   * @description 누적 카운터 지표를 생성하고 인스턴스의 레지스트리에 자동 등록한다
   * (`registers`를 직접 넘길 필요 없음). 요청 수, 에러 수처럼 "계속 증가하기만 하는" 값에 사용한다.
   * `gauge`/`histogram`/`summary`도 동일한 방식으로 등록된다.
   */
  counter<T extends string>(config: Omit<CounterConfiguration<T>, 'registers'>): Counter<T> {
    return new Counter<T>({ ...config, registers: [this.registry] })
  }

  gauge<T extends string>(config: Omit<GaugeConfiguration<T>, 'registers'>): Gauge<T> {
    return new Gauge<T>({ ...config, registers: [this.registry] })
  }

  histogram<T extends string>(
    config: Omit<HistogramConfiguration<T>, 'registers'>,
  ): Histogram<T> {
    return new Histogram<T>({ ...config, registers: [this.registry] })
  }

  summary<T extends string>(config: Omit<SummaryConfiguration<T>, 'registers'>): Summary<T> {
    return new Summary<T>({ ...config, registers: [this.registry] })
  }

  /**
   * @description 등록된 모든 지표를 Prometheus 텍스트 포맷 문자열로 직렬화한다.
   * `/metrics` 엔드포인트에서 그대로 응답 바디로 사용한다 (`contentType`과 함께 헤더 설정).
   */
  async metrics(): Promise<string> {
    return this.registry.metrics()
  }

  /**
   * @description `metrics()`가 반환하는 문자열에 대응하는 `Content-Type` 헤더 값.
   * Prometheus가 응답 포맷 버전을 인식할 수 있도록 반드시 함께 설정해야 한다.
   */
  get contentType(): string {
    return this.registry.contentType
  }

  /**
   * @description 레지스트리에 등록된 모든 지표를 제거한다. 주로 테스트에서 매 케이스마다
   * 깨끗한 상태로 시작하기 위해 사용한다 (운영 코드에서 호출할 일은 거의 없음).
   */
  clear(): void {
    this.registry.clear()
  }
}

/**
 * @description `ForgeMetrics`의 함수형 래퍼. `new` 없이 옵션으로 메트릭 수집기를 생성하고
 * 싶을 때 사용한다 (동작은 `new ForgeMetrics(options)`와 동일).
 */
export function createMetrics(options?: MetricsOptions): ForgeMetrics {
  return new ForgeMetrics(options)
}
