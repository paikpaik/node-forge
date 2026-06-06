import { describe, it, expect } from 'vitest'
import { ok, fail, paginated } from './response'
import type { PaginationMeta } from '../core'

describe('ok', () => {
  it('success: true와 data를 반환한다', () => {
    const result = ok({ id: 1, name: 'foo' })
    expect(result).toEqual({ success: true, data: { id: 1, name: 'foo' } })
  })

  it('null data도 허용한다', () => {
    const result = ok(null)
    expect(result).toEqual({ success: true, data: null })
  })

  it('배열 data도 허용한다', () => {
    const result = ok([1, 2, 3])
    expect(result).toEqual({ success: true, data: [1, 2, 3] })
  })
})

describe('fail', () => {
  it('success: false와 error 객체를 반환한다', () => {
    const result = fail('E9404', '리소스를 찾을 수 없습니다')
    expect(result).toEqual({
      success: false,
      error: { code: 'E9404', message: '리소스를 찾을 수 없습니다' },
    })
  })

  it('data 필드를 포함하지 않는다', () => {
    const result = fail('E9500', '서버 오류')
    expect(result.data).toBeUndefined()
  })
})

describe('paginated', () => {
  it('data와 meta를 함께 반환한다', () => {
    const meta: PaginationMeta = { total: 100, page: 1, limit: 10, totalPages: 10 }
    const result = paginated([{ id: 1 }, { id: 2 }], meta)
    expect(result).toEqual({
      success: true,
      data: [{ id: 1 }, { id: 2 }],
      meta,
    })
  })

  it('빈 배열도 허용한다', () => {
    const meta: PaginationMeta = { total: 0, page: 1, limit: 10, totalPages: 0 }
    const result = paginated([], meta)
    expect(result.data).toEqual([])
    expect(result.meta?.total).toBe(0)
  })
})
