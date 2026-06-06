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

  async metrics(): Promise<string> {
    return this.registry.metrics()
  }

  get contentType(): string {
    return this.registry.contentType
  }

  clear(): void {
    this.registry.clear()
  }
}

export function createMetrics(options?: MetricsOptions): ForgeMetrics {
  return new ForgeMetrics(options)
}
