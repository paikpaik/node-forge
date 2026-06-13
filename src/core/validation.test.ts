import { describe, it, expect, afterEach, vi } from 'vitest'
import { parsePositiveInt, parsePagination, parseSort, assertDefined, requireEnv } from './validation'

describe('parsePositiveInt', () => {
  it('양의 정수 문자열을 파싱한다', () => {
    expect(parsePositiveInt('1')).toBe(1)
    expect(parsePositiveInt('42')).toBe(42)
  })

  it('숫자 타입도 파싱한다', () => {
    expect(parsePositiveInt(5)).toBe(5)
  })

  it('0이면 null을 반환한다', () => {
    expect(parsePositiveInt(0)).toBeNull()
    expect(parsePositiveInt('0')).toBeNull()
  })

  it('음수이면 null을 반환한다', () => {
    expect(parsePositiveInt(-1)).toBeNull()
    expect(parsePositiveInt('-5')).toBeNull()
  })

  it('소수이면 null을 반환한다', () => {
    expect(parsePositiveInt('3.5')).toBeNull()
    expect(parsePositiveInt(1.5)).toBeNull()
  })

  it('비숫자 문자열이면 null을 반환한다', () => {
    expect(parsePositiveInt('abc')).toBeNull()
    expect(parsePositiveInt('')).toBeNull()
  })

  it('null/undefined이면 null을 반환한다', () => {
    expect(parsePositiveInt(null)).toBeNull()
    expect(parsePositiveInt(undefined)).toBeNull()
  })
})

describe('parsePagination', () => {
  it('유효한 page/size를 파싱하고 offset을 계산한다', () => {
    expect(parsePagination({ page: '2', size: '10' })).toEqual({ page: 2, size: 10, offset: 10 })
  })

  it('page/size가 없으면 기본값을 사용한다', () => {
    const result = parsePagination({})
    expect(result.page).toBe(1)
    expect(result.size).toBe(20)
    expect(result.offset).toBe(0)
  })

  it('defaultSize 옵션을 적용한다', () => {
    expect(parsePagination({}, { defaultSize: 30 }).size).toBe(30)
  })

  it('size가 maxSize를 초과하면 클램핑한다', () => {
    expect(parsePagination({ size: '999' }, { maxSize: 50 }).size).toBe(50)
  })

  it('page가 0 이하이면 1로 보정한다', () => {
    expect(parsePagination({ page: '0' }).page).toBe(1)
    expect(parsePagination({ page: '-3' }).page).toBe(1)
  })

  it('비숫자 page/size는 기본값으로 처리한다', () => {
    const result = parsePagination({ page: 'abc', size: 'xyz' })
    expect(result.page).toBe(1)
    expect(result.size).toBe(20)
  })

  it('page=3, size=10이면 offset=20이다', () => {
    expect(parsePagination({ page: '3', size: '10' }).offset).toBe(20)
  })
})

describe('parseSort', () => {
  const fields = ['name', 'createdAt', 'score']

  it('허용된 필드와 방향을 파싱한다', () => {
    expect(parseSort({ sort: 'name:asc' }, fields)).toEqual({ field: 'name', direction: 'ASC' })
    expect(parseSort({ sort: 'score:desc' }, fields)).toEqual({ field: 'score', direction: 'DESC' })
  })

  it('방향 대소문자를 무관하게 파싱한다', () => {
    expect(parseSort({ sort: 'name:DESC' }, fields).direction).toBe('DESC')
    expect(parseSort({ sort: 'name:Desc' }, fields).direction).toBe('DESC')
  })

  it('방향 없이 필드만 전달하면 ASC가 기본값이다', () => {
    expect(parseSort({ sort: 'name' }, fields)).toEqual({ field: 'name', direction: 'ASC' })
  })

  it('허용되지 않은 필드는 defaultField로 fallback한다', () => {
    expect(parseSort({ sort: 'password:asc' }, fields, 'name').field).toBe('name')
  })

  it('defaultField가 없으면 allowedFields[0]으로 fallback한다', () => {
    expect(parseSort({ sort: 'hack' }, fields).field).toBe('name')
  })

  it('sort가 없으면 defaultField를 사용한다', () => {
    expect(parseSort({}, fields, 'createdAt').field).toBe('createdAt')
  })

  it('필드 이름은 대소문자 무관하게 매칭한다', () => {
    expect(parseSort({ sort: 'CREATEDAT:asc' }, fields).field).toBe('createdAt')
  })
})

describe('assertDefined', () => {
  it('값이 있으면 아무것도 하지 않는다', () => {
    expect(() => assertDefined('value')).not.toThrow()
    expect(() => assertDefined(0)).not.toThrow()
    expect(() => assertDefined(false)).not.toThrow()
  })

  it('null이면 에러를 던진다', () => {
    expect(() => assertDefined(null)).toThrow()
  })

  it('undefined이면 에러를 던진다', () => {
    expect(() => assertDefined(undefined)).toThrow()
  })

  it('label이 있으면 에러 메시지에 포함된다', () => {
    expect(() => assertDefined(null, 'userId')).toThrow('userId')
  })
})

describe('requireEnv', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('환경 변수가 있으면 값을 반환한다', () => {
    vi.stubEnv('TEST_VAR', 'hello')
    expect(requireEnv('TEST_VAR')).toBe('hello')
  })

  it('환경 변수가 없으면 에러를 던진다', () => {
    vi.stubEnv('MISSING_VAR', undefined as unknown as string)
    expect(() => requireEnv('MISSING_VAR')).toThrow('MISSING_VAR')
  })

  it('환경 변수가 빈 문자열이면 에러를 던진다', () => {
    vi.stubEnv('EMPTY_VAR', '')
    expect(() => requireEnv('EMPTY_VAR')).toThrow('EMPTY_VAR')
  })
})
