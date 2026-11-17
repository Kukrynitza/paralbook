import { describe, expect, it } from 'vitest'
import { sentenceAt } from './context'

function tokens(text: string) {
  return text
    .split(/(\s+)/)
    .filter(Boolean)
    .map((part) => ({ text: part }))
}

describe('sentenceAt', () => {
  it('returns the sentence around the clicked word', () => {
    const parts = tokens('Hello world. Second sentence here.')
    const index = parts.findIndex((token) => token.text === 'sentence')
    expect(sentenceAt(parts, index)).toBe('Second sentence here.')
  })

  it('keeps punctuation attached to the sentence', () => {
    const parts = tokens('First one! Second one? Third one.')
    const index = parts.findIndex((token) => token.text === 'Second')
    expect(sentenceAt(parts, index)).toBe('Second one?')
  })

  it('returns empty text for an empty list', () => {
    expect(sentenceAt([], 0)).toBe('')
  })

  it('clips very long sentences around the selected word', () => {
    const long = `${'word '.repeat(200)}target ${'word '.repeat(200)}.`
    const parts = tokens(long)
    const index = parts.findIndex((token) => token.text === 'target')
    const value = sentenceAt(parts, index, 120)
    expect(value.length).toBeLessThanOrEqual(122)
    expect(value).toContain('target')
  })
})
