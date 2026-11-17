import { describe, expect, it } from 'vitest'
import { canAddWithoutKey, isTwoBooks, needsTranslation } from '@/sorse/textRules'

describe('needsTranslation', () => {
  it('false for empty input', () => {
    expect(needsTranslation('', '')).toBe(false)
  })

  it('false when both languages are filled', () => {
    expect(needsTranslation('The duck lived by the lake.', 'Утка жила у озера.')).toBe(false)
  })

  it('true for english only', () => {
    expect(needsTranslation('The duck lived by the lake.', '  ')).toBe(true)
  })

  it('true for russian only', () => {
    expect(needsTranslation('', 'Утка жила у озера.')).toBe(true)
  })
})

describe('isTwoBooks', () => {
  it('detects the parallel book format', () => {
    expect(isTwoBooks('book.2books')).toBe(true)
    expect(isTwoBooks('BOOK.2BOOKS')).toBe(true)
    expect(isTwoBooks('book.txt')).toBe(false)
  })
})

describe('canAddWithoutKey', () => {
  it('allows a ready pair of texts', () => {
    expect(canAddWithoutKey({ english: 'Hello.', russian: 'Привет.' })).toBe(true)
  })

  it('blocks a single language', () => {
    expect(canAddWithoutKey({ english: 'Hello.', russian: '' })).toBe(false)
    expect(canAddWithoutKey({ english: '', russian: 'Привет.' })).toBe(false)
  })

  it('allows only the parallel book format among files', () => {
    expect(canAddWithoutKey({ fileName: 'book.2books' })).toBe(true)
    expect(canAddWithoutKey({ fileName: 'book.epub' })).toBe(false)
  })
})
