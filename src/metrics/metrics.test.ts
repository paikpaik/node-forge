import { describe, it, expect, beforeEach } from 'vitest'
import { ForgeMetrics, createMetrics } from './metrics'

describe('ForgeMetrics', () => {
  let metrics: ForgeMetrics

  beforeEach(() => {
    // defaultMetrics: false로 기본 프로세스 메트릭 수집 비활성화 (테스트 격리)
    metrics = createMetrics({ defaultMetrics: false })
  })

  it('createMetrics로 인스턴스를 생성한다', () => {
    expect(metrics).toBeInstanceOf(ForgeMetrics)
  })

  it('counter를 생성하고 증가시킨다', async () => {
    const counter = metrics.counter({ name: 'test_counter', help: 'test counter' })
    counter.inc()
    counter.inc(3)

    const result = await metrics.metrics()
    expect(result).toContain('test_counter 4')
  })

  it('gauge를 생성하고 값을 설정한다', async () => {
    const gauge = metrics.gauge({ name: 'test_gauge', help: 'test gauge' })
    gauge.set(42)

    const result = await metrics.metrics()
    expect(result).toContain('test_gauge 42')
  })

  it('histogram을 생성하고 관찰한다', async () => {
    const histogram = metrics.histogram({
      name: 'test_histogram',
      help: 'test histogram',
      buckets: [0.1, 0.5, 1],
    })
    histogram.observe(0.3)

    const result = await metrics.metrics()
    expect(result).toContain('test_histogram')
  })

  it('summary를 생성하고 관찰한다', async () => {
    const summary = metrics.summary({ name: 'test_summary', help: 'test summary' })
    summary.observe(1.5)

    const result = await metrics.metrics()
    expect(result).toContain('test_summary')
  })

  it('labelNames를 가진 counter를 생성한다', async () => {
    const counter = metrics.counter({
      name: 'http_requests_total',
      help: 'HTTP requests',
      labelNames: ['method', 'status'] as const,
    })
    counter.inc({ method: 'GET', status: '200' })

    const result = await metrics.metrics()
    expect(result).toContain('method="GET"')
    expect(result).toContain('status="200"')
  })

  it('contentType이 prometheus 형식이다', () => {
    expect(metrics.contentType).toContain('text/plain')
  })

  it('clear()로 모든 메트릭을 초기화한다', async () => {
    metrics.counter({ name: 'to_be_cleared', help: 'will be cleared' })
    metrics.clear()
    const result = await metrics.metrics()
    expect(result).not.toContain('to_be_cleared')
  })
})
