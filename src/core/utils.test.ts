import { describe, it, expect } from 'vitest'
import { omit, pick, deepMerge, chunk, groupBy, keyBy, compact } from './utils'

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

describe('chunk', () => {
  it('배열을 size 개씩 나눈다', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('나머지가 없으면 균등하게 나눈다', () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]])
  })

  it('size가 배열보다 크면 배열 전체를 하나로 반환한다', () => {
    expect(chunk([1, 2, 3], 10)).toEqual([[1, 2, 3]])
  })

  it('빈 배열이면 빈 배열을 반환한다', () => {
    expect(chunk([], 3)).toEqual([])
  })

  it('size가 0 이하이면 에러를 던진다', () => {
    expect(() => chunk([1, 2], 0)).toThrow()
    expect(() => chunk([1, 2], -1)).toThrow()
  })
})

describe('groupBy', () => {
  it('keyFn 반환값으로 배열을 그루핑한다', () => {
    const arr = [{ id: 1, type: 'a' }, { id: 2, type: 'b' }, { id: 3, type: 'a' }]
    const result = groupBy(arr, (item) => item.type)
    expect(result['a']).toEqual([{ id: 1, type: 'a' }, { id: 3, type: 'a' }])
    expect(result['b']).toEqual([{ id: 2, type: 'b' }])
  })

  it('빈 배열이면 빈 객체를 반환한다', () => {
    expect(groupBy([], (x: string) => x)).toEqual({})
  })

  it('모든 요소가 같은 키이면 하나의 그룹으로 묶인다', () => {
    const result = groupBy([1, 2, 3], () => 'same')
    expect(result['same']).toEqual([1, 2, 3])
  })
})

describe('keyBy', () => {
  it('keyFn 반환값으로 배열을 인덱싱한다', () => {
    const users = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]
    const byId = keyBy(users, (u) => u.id)
    expect(byId[1]).toEqual({ id: 1, name: 'Alice' })
    expect(byId[2]).toEqual({ id: 2, name: 'Bob' })
  })

  it('키 중복 시 뒤에 오는 항목으로 덮어쓴다', () => {
    const arr = [{ id: 1, v: 'first' }, { id: 1, v: 'second' }]
    expect(keyBy(arr, (x) => x.id)[1]).toEqual({ id: 1, v: 'second' })
  })

  it('빈 배열이면 빈 객체를 반환한다', () => {
    expect(keyBy([], (x: string) => x)).toEqual({})
  })
})

describe('compact', () => {
  it('null과 undefined를 제거한다', () => {
    expect(compact([1, null, 2, undefined, 3])).toEqual([1, 2, 3])
  })

  it('0, 빈 문자열, false는 제거하지 않는다', () => {
    expect(compact([0, '', false, null, undefined])).toEqual([0, '', false])
  })

  it('빈 배열이면 빈 배열을 반환한다', () => {
    expect(compact([])).toEqual([])
  })

  it('null/undefined가 없으면 원본과 같은 값을 반환한다', () => {
    expect(compact([1, 2, 3])).toEqual([1, 2, 3])
  })
})
