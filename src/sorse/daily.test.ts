import { describe, expect, it } from 'vitest'
import { dailyUsed, emptyDay, parseDayState, remainingNew } from './daily'

describe('daily study state', () => {
  it('resets a stale day', () => {
    const raw = JSON.stringify({ day: '2020-01-01', extra: 3, targets: ['one'], completed: [], introduced: ['one'] })
    expect(parseDayState(raw, '2026-11-20')).toEqual(emptyDay('2026-11-20'))
  })

  it('normalizes counters and keeps unique words', () => {
    const raw = JSON.stringify({
      day: '2026-11-20',
      extra: -3,
      targets: ['Cat', 'cat', ' dog '],
      completed: ['cat'],
      introduced: ['cat', 5, 'dog'],
    })
    expect(parseDayState(raw, '2026-11-20')).toEqual({
      day: '2026-11-20',
      extra: 0,
      targets: ['cat', 'dog'],
      completed: ['cat'],
      reviewed: [],
      introduced: ['cat', 'dog'],
    })
  })

  it('counts introduced words and the remaining target budget', () => {
    const state = {
      day: '2026-11-20',
      extra: 5,
      targets: ['one', 'two'],
      completed: ['one'],
      reviewed: ['one'],
      introduced: ['one', 'two', 'three'],
    }
    expect(dailyUsed(state)).toBe(3)
    expect(remainingNew(10, state)).toBe(13)
  })

  it('counts first-try known words but keeps reserved starred words in the deck', () => {
    const state = {
      day: '2026-11-20',
      extra: 0,
      targets: [],
      completed: ['one'],
      reviewed: [],
      introduced: ['one', 'starred'],
    }
    expect(dailyUsed(state)).toBe(2)
    expect(remainingNew(2, state)).toBe(1)
  })
})
