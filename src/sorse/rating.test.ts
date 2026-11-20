import { describe, expect, it } from 'vitest'
import { ratingsWord, ratingSummary } from './rating'

describe('ratingsWord', () => {
  it('uses the singular for one and 21', () => {
    expect(ratingsWord(1)).toBe('оценка')
    expect(ratingsWord(21)).toBe('оценка')
    expect(ratingsWord(101)).toBe('оценка')
  })

  it('uses the paucal for two to four', () => {
    expect(ratingsWord(2)).toBe('оценки')
    expect(ratingsWord(4)).toBe('оценки')
    expect(ratingsWord(22)).toBe('оценки')
    expect(ratingsWord(24)).toBe('оценки')
  })

  it('uses the plural for zero, five and the teens', () => {
    expect(ratingsWord(0)).toBe('оценок')
    expect(ratingsWord(5)).toBe('оценок')
    expect(ratingsWord(11)).toBe('оценок')
    expect(ratingsWord(12)).toBe('оценок')
    expect(ratingsWord(14)).toBe('оценок')
    expect(ratingsWord(25)).toBe('оценок')
    expect(ratingsWord(111)).toBe('оценок')
  })
})

describe('ratingSummary', () => {
  it('joins the average and the count', () => {
    expect(ratingSummary(4.5, 12)).toBe('4.5 · 12 оценок')
    expect(ratingSummary(5, 1)).toBe('5.0 · 1 оценка')
  })

  it('says there are no ratings yet', () => {
    expect(ratingSummary(null, 0)).toBe('Нет оценок')
    expect(ratingSummary(4.5, 0)).toBe('Нет оценок')
    expect(ratingSummary(null, 3)).toBe('Нет оценок')
  })
})
