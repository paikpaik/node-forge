import { describe, it, expect } from 'vitest'
import { parseTraceparent, buildTraceparent } from './traceparent'

describe('parseTraceparent', () => {
  it('유효한 traceparent 헤더를 파싱한다', () => {
    const result = parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01')
    expect(result).toEqual({
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      parentId: '00f067aa0ba902b7',
      sampled: true,
    })
  })

  it('sampled 플래그가 00이면 sampled: false를 반환한다', () => {
    const result = parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00')
    expect(result?.sampled).toBe(false)
  })

  it('대문자 hex도 소문자로 정규화한다', () => {
    const result = parseTraceparent('00-4BF92F3577B34DA6A3CE929D0E0E4736-00F067AA0BA902B7-01')
    expect(result?.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736')
    expect(result?.parentId).toBe('00f067aa0ba902b7')
  })

  it('앞뒤 공백을 무시한다', () => {
    const result = parseTraceparent('  00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01  ')
    expect(result).not.toBeNull()
  })

  it('포맷이 잘못된 헤더는 null을 반환한다', () => {
    expect(parseTraceparent('')).toBeNull()
    expect(parseTraceparent('invalid')).toBeNull()
    expect(parseTraceparent('00-tooshort-00f067aa0ba902b7-01')).toBeNull()
    expect(parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-tooshort-01')).toBeNull()
  })

  it('traceId가 모두 0이면 null을 반환한다', () => {
    expect(parseTraceparent('00-00000000000000000000000000000000-00f067aa0ba902b7-01')).toBeNull()
  })

  it('parentId가 모두 0이면 null을 반환한다', () => {
    expect(parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01')).toBeNull()
  })
})

describe('buildTraceparent', () => {
  it('UUID traceId에서 대시를 제거해 32-char hex를 생성한다', () => {
    const result = buildTraceparent('550e8400-e29b-41d4-a716-446655440000')
    expect(result).toMatch(/^00-550e8400e29b41d4a716446655440000-[\da-f]{16}-01$/)
  })

  it('spanId를 지정하면 해당 값을 사용한다', () => {
    const result = buildTraceparent('4bf92f3577b34da6a3ce929d0e0e4736', 'abc1234567890def')
    expect(result).toBe('00-4bf92f3577b34da6a3ce929d0e0e4736-abc1234567890def-01')
  })

  it('spanId를 생략하면 16-char hex가 자동 생성된다', () => {
    const result = buildTraceparent('4bf92f3577b34da6a3ce929d0e0e4736')
    expect(result).toMatch(/^00-4bf92f3577b34da6a3ce929d0e0e4736-[\da-f]{16}-01$/)
  })

  it('spanId를 두 번 생성하면 서로 다른 값이 나온다', () => {
    const a = buildTraceparent('4bf92f3577b34da6a3ce929d0e0e4736')
    const b = buildTraceparent('4bf92f3577b34da6a3ce929d0e0e4736')
    // traceparent 포맷: 00-{traceId}-{spanId}-{flags} → split 인덱스 2가 spanId
    const spanA = a.split('-')[2]
    const spanB = b.split('-')[2]
    expect(spanA).not.toBe(spanB)
  })

  it('sampled: false이면 flags가 00이다', () => {
    const result = buildTraceparent('4bf92f3577b34da6a3ce929d0e0e4736', undefined, false)
    expect(result).toMatch(/-00$/)
  })

  it('기본 sampled는 true(01)이다', () => {
    const result = buildTraceparent('4bf92f3577b34da6a3ce929d0e0e4736')
    expect(result).toMatch(/-01$/)
  })
})
