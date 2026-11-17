import { describe, expect, it } from 'vitest'
import { HINT_MAX, shortHint } from './hint'

describe('shortHint', () => {
  it('trims and limits the hint', () => {
    expect(shortHint('  hello  ')).toBe('hello')
    expect(shortHint('a'.repeat(HINT_MAX + 10))).toHaveLength(HINT_MAX)
  })
})
