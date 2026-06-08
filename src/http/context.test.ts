import { describe, it, expect } from 'vitest'
import { buildTraceHeaders } from './context'

describe('buildTraceHeaders', () => {
  it('traceId와 requestId를 기본 헤더 이름으로 변환한다', () => {
    expect(buildTraceHeaders({ traceId: 'trace-1', requestId: 'req-1' })).toEqual({
      'x-trace-id': 'trace-1',
      'x-request-id': 'req-1',
    })
  })

  it('traceId만 있으면 requestId 헤더는 포함하지 않는다', () => {
    expect(buildTraceHeaders({ traceId: 'trace-1' })).toEqual({ 'x-trace-id': 'trace-1' })
  })

  it('requestId만 있으면 traceId 헤더는 포함하지 않는다', () => {
    expect(buildTraceHeaders({ requestId: 'req-1' })).toEqual({ 'x-request-id': 'req-1' })
  })

  it('둘 다 없으면 빈 객체를 반환한다', () => {
    expect(buildTraceHeaders({})).toEqual({})
  })

  it('headerNames로 헤더 이름을 커스터마이즈할 수 있다', () => {
    expect(
      buildTraceHeaders(
        { traceId: 'trace-1', requestId: 'req-1' },
        { traceId: 'x-b3-traceid', requestId: 'x-b3-spanid' },
      ),
    ).toEqual({
      'x-b3-traceid': 'trace-1',
      'x-b3-spanid': 'req-1',
    })
  })
})
