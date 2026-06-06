import { describe, it, expect } from 'vitest'
import { omit, pick, deepMerge } from './utils'

describe('omit', () => {
  it('지정한 키를 제거한 객체를 반환한다', () => {
    const obj = { a: 1, b: 2, c: 3 }
    expect(omit(obj, ['b'])).toEqual({ a: 1, c: 3 })
  })

  it('여러 키를 한번에 제거한다', () => {
    const obj = { id: 1, password: 'secret', name: 'foo' }
    expect(omit(obj, ['password', 'id'])).toEqual({ name: 'foo' })
  })

  it('원본 객체를 변경하지 않는다', () => {
    const obj = { a: 1, b: 2 }
    omit(obj, ['a'])
    expect(obj).toEqual({ a: 1, b: 2 })
  })
})

describe('pick', () => {
  it('지정한 키만 포함한 객체를 반환한다', () => {
    const obj = { a: 1, b: 2, c: 3 }
    expect(pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 })
  })

  it('존재하지 않는 키는 무시한다', () => {
    const obj = { a: 1, b: 2 }
    expect(pick(obj, ['a'])).toEqual({ a: 1 })
  })
})

describe('deepMerge', () => {
  it('중첩 객체를 깊게 병합한다', () => {
    const target = { a: 1, nested: { x: 1, y: 2 } }
    const source = { nested: { y: 99, z: 3 } }
    expect(deepMerge(target, source)).toEqual({
      a: 1,
      nested: { x: 1, y: 99, z: 3 },
    })
  })

  it('배열은 덮어쓴다 (병합하지 않는다)', () => {
    const target = { list: [1, 2, 3] }
    const source = { list: [4, 5] }
    expect(deepMerge(target, source)).toEqual({ list: [4, 5] })
  })

  it('source의 undefined 값은 무시한다', () => {
    const target = { a: 1, b: 2 }
    const source = { b: undefined }
    expect(deepMerge(target, source)).toEqual({ a: 1, b: 2 })
  })

  it('여러 source를 순서대로 병합한다', () => {
    const result = deepMerge({ a: 1 }, { b: 2 }, { c: 3 })
    expect(result).toEqual({ a: 1, b: 2, c: 3 })
  })

  it('원본 객체를 변경하지 않는다', () => {
    const target = { a: 1, nested: { x: 1 } }
    deepMerge(target, { nested: { x: 99 } })
    expect(target.nested.x).toBe(1)
  })
})
