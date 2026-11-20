import { describe, expect, it } from 'vitest'
import { moderateText } from './moderation'

describe('publish moderation', () => {
  it('allows ordinary educational text', () => {
    expect(moderateText('The morning was quiet. The lake was calm and the city was still asleep.').allowed).toBe(true)
  })

  it('blocks explicit English words', () => {
    const result = moderateText('This is a shit example.')
    expect(result.allowed).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it('blocks explicit Russian words', () => {
    const result = moderateText('Это просто хуйня какая-то.')
    expect(result.allowed).toBe(false)
  })

  it('catches spaced-out letters', () => {
    expect(moderateText('f u c k this text').allowed).toBe(false)
  })

  it('does not block names and ordinary words that contain roots', () => {
    expect(moderateText('Charles Dickens wrote Oliver Twist.').allowed).toBe(true)
    expect(moderateText('This is a fire retardant.').allowed).toBe(true)
    expect(moderateText('He is niggardly.').allowed).toBe(true)
    expect(moderateText('Купил бляху для ремня.').allowed).toBe(true)
    expect(moderateText('Moby Dick is a novel by Herman Melville.').allowed).toBe(true)
    expect(moderateText('Dick and Jane went home.').allowed).toBe(true)
    expect(moderateText('The pussy willow is a plant.').allowed).toBe(true)
    expect(moderateText('A pussycat sat on the mat.').allowed).toBe(true)
  })

  it('catches inflected forms', () => {
    expect(moderateText('This is fucking awful.').allowed).toBe(false)
    expect(moderateText('He is a dickhead.').allowed).toBe(false)
    expect(moderateText('Он долбоёб.').allowed).toBe(false)
    expect(moderateText('Ну ты и блядь.').allowed).toBe(false)
  })

  it('catches common insults', () => {
    expect(moderateText('You asshole.').allowed).toBe(false)
    expect(moderateText('What a dumbass.').allowed).toBe(false)
    expect(moderateText('Какая же жопа.').allowed).toBe(false)
    expect(moderateText('Он сука.').allowed).toBe(false)
    expect(moderateText('Срать хочется.').allowed).toBe(false)
  })
})
