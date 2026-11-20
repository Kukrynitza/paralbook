import { describe, expect, it } from 'vitest'
import { labelsFor } from './gloss'

describe('labelsFor', () => {
  it('maps English universal tags to dictionary labels', () => {
    expect(labelsFor('VERB')).toEqual(['гл.'])
    expect(labelsFor('AUX')).toEqual(['гл.'])
    expect(labelsFor('ADV')).toEqual(['нареч.'])
    expect(labelsFor('DET')).toEqual(['арт.', 'мест.'])
    expect(labelsFor(undefined)).toEqual([])
    expect(labelsFor('X')).toEqual([])
  })
})
