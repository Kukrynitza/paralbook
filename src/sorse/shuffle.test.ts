import { describe, expect, it } from 'vitest'
import { shuffle } from './shuffle'

describe('shuffle', () => {
  it('keeps every item and the original length', () => {
    const source = Array.from({ length: 60 }, (_, index) => index)
    const mixed = shuffle(source)
    expect(mixed).toHaveLength(source.length)
    expect([...mixed].sort((a, b) => a - b)).toEqual(source)
  })

  it('does not mutate the source', () => {
    const source = [1, 2, 3, 4]
    shuffle(source)
    expect(source).toEqual([1, 2, 3, 4])
  })

  it('handles empty and single-item lists', () => {
    expect(shuffle([])).toEqual([])
    expect(shuffle(['one'])).toEqual(['one'])
  })
})
