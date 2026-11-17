import { describe, expect, it } from 'vitest'
import { normalizeChunk, requestsPer10k } from './translationPrefs'

describe('normalizeChunk', () => {
  it('clamps sentences to 1..20', () => {
    expect(normalizeChunk('sentences', 0)).toEqual({ unit: 'sentences', size: 1 })
    expect(normalizeChunk('sentences', 100)).toEqual({ unit: 'sentences', size: 20 })
    expect(normalizeChunk('sentences', 3)).toEqual({ unit: 'sentences', size: 3 })
  })

  it('clamps tokens to 300..4000', () => {
    expect(normalizeChunk('tokens', 10)).toEqual({ unit: 'tokens', size: 300 })
    expect(normalizeChunk('tokens', 9000)).toEqual({ unit: 'tokens', size: 4000 })
    expect(normalizeChunk('tokens', 1200)).toEqual({ unit: 'tokens', size: 1200 })
  })

  it('falls back to tokens for an unknown unit and size', () => {
    expect(normalizeChunk('unknown', 'nope')).toEqual({ unit: 'tokens', size: 1200 })
  })
})

describe('requestsPer10k', () => {
  it('estimates fewer requests for bigger chunks', () => {
    expect(requestsPer10k({ unit: 'tokens', size: 1200 })).toBe(11)
    expect(requestsPer10k({ unit: 'sentences', size: 3 })).toBe(222)
  })
})
