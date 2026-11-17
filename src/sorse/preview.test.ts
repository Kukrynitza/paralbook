import { describe, expect, it } from 'vitest'
import { preview } from './preview'

describe('preview', () => {
  it('returns the first sentence when it fits', () => {
    expect(preview('First sentence. Second sentence.')).toBe('First sentence.')
  })

  it('returns the whole short sentence', () => {
    expect(preview('Only one sentence.')).toBe('Only one sentence.')
  })

  it('cuts a long text at a word boundary and adds an ellipsis', () => {
    const value = preview('word '.repeat(100), 20)
    expect(value.endsWith('…')).toBe(true)
    expect(value.length).toBeLessThanOrEqual(21)
  })

  it('handles empty text', () => {
    expect(preview('   ')).toBe('')
  })
})
