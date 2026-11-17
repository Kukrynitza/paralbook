import { describe, expect, it } from 'vitest'
import { splitByShare } from './align'

describe('splitByShare', () => {
  it('splits items proportionally to weights', () => {
    expect(splitByShare([1, 2, 3, 4], [1, 1])).toEqual([[1, 2], [3, 4]])
    expect(splitByShare([1, 2, 3, 4], [1, 3])).toEqual([[1], [2, 3, 4]])
  })

  it('returns empty slices when total weight is zero', () => {
    expect(splitByShare([1, 2], [0, 0])).toEqual([[], []])
  })

  it('keeps every item exactly once', () => {
    const slices = splitByShare([1, 2, 3, 4, 5], [2, 1, 2])
    expect(slices.flat()).toEqual([1, 2, 3, 4, 5])
  })
})
