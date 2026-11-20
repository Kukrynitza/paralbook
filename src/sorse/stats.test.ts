import { describe, expect, it } from 'vitest'
import { niceMax } from './stats'

describe('niceMax', () => {
  it('rounds the axis up to a readable value', () => {
    expect(niceMax(1)).toBe(5)
    expect(niceMax(6)).toBe(10)
    expect(niceMax(11)).toBe(20)
    expect(niceMax(42)).toBe(50)
    expect(niceMax(180)).toBe(200)
  })

  it('never returns zero for empty charts', () => {
    expect(niceMax(0)).toBe(5)
    expect(niceMax(Number.NaN)).toBe(5)
  })
})
