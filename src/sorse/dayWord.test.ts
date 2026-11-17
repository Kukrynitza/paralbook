import { describe, expect, it } from 'vitest'
import dayWord from './dayWord'

describe('dayWord', () => {
  it('declines Russian days correctly', () => {
    expect(dayWord(1)).toBe('день')
    expect(dayWord(2)).toBe('дня')
    expect(dayWord(5)).toBe('дней')
    expect(dayWord(11)).toBe('дней')
    expect(dayWord(21)).toBe('день')
    expect(dayWord(22)).toBe('дня')
  })
})
