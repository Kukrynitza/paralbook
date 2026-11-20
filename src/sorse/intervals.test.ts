import { describe, expect, it } from 'vitest'
import { MASTER_STEP, nextReview, reviewMinutes } from './intervals'

describe('review intervals', () => {
  it('builds the ReWord-like ladder', () => {
    let state = nextReview(undefined, true)
    expect(state).toEqual({ correct: 1, wrong: 0, intervalDays: 1, mastered: false })
    expect(reviewMinutes(1)).toBe(30)

    state = nextReview(state!, true)!
    expect(state.intervalDays).toBe(2)
    expect(reviewMinutes(state.intervalDays)).toBe(120)

    state = nextReview(state, true)!
    expect(reviewMinutes(state.intervalDays)).toBe(1440)

    state = nextReview(state, true)!
    expect(reviewMinutes(state.intervalDays)).toBe(10080)

    state = nextReview(state, true)!
    expect(state.intervalDays).toBe(MASTER_STEP)
    expect(reviewMinutes(state.intervalDays)).toBe(86400)
    expect(state.mastered).toBe(false)
  })

  it('masters only after the final 60-day review', () => {
    const state = nextReview({ correct: 5, wrong: 0, intervalDays: 5, mastered: false }, true)
    expect(state).toEqual({ correct: 6, wrong: 0, intervalDays: 5, mastered: true })
  })

  it('steps back on a miss without resetting correct answers', () => {
    expect(nextReview({ correct: 5, wrong: 0, intervalDays: 5, mastered: false }, false)).toEqual({
      correct: 5,
      wrong: 1,
      intervalDays: 4,
      mastered: false,
    })
    expect(nextReview({ correct: 0, wrong: 0, intervalDays: 0, mastered: false }, false)?.intervalDays).toBe(0)
    expect(nextReview({ correct: 1, wrong: 0, intervalDays: 1, mastered: false }, false)?.intervalDays).toBe(1)
  })

  it('requires a new full 60-day interval after a miss on the final check', () => {
    let state = nextReview({ correct: 5, wrong: 0, intervalDays: 5, mastered: false }, false)!
    expect(state.mastered).toBe(false)
    state = nextReview(state, true)!
    expect(state.intervalDays).toBe(5)
    expect(state.mastered).toBe(false)
    state = nextReview(state, true)!
    expect(state.mastered).toBe(true)
  })

  it('does not change an already mastered word', () => {
    expect(nextReview({ correct: 6, wrong: 0, intervalDays: 5, mastered: true }, true)).toBeNull()
  })
})
