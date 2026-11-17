import { describe, expect, it } from 'vitest'
import { contrastRatio, ensureContrast, normalizeHex, readableOn } from '@/sorse/themeColors'
import {
  DEFAULT_THEME,
  customThemeOf,
  normalizeTheme,
  resolveTheme,
  sectionForPath,
} from '@/sorse/themeTypes'

describe('sectionForPath', () => {
  it('maps the main routes', () => {
    expect(sectionForPath('/')).toBe('collection')
    expect(sectionForPath('/library')).toBe('library')
    expect(sectionForPath('/chat')).toBe('chat')
    expect(sectionForPath('/text')).toBe('add')
    expect(sectionForPath('/settings')).toBe('settings')
    expect(sectionForPath('/stats')).toBe('stats')
    expect(sectionForPath('/friends/add')).toBe('friends')
  })

  it('keeps related sections together', () => {
    expect(sectionForPath('/read/abc')).toBe('reader')
    expect(sectionForPath('/vocabulary')).toBe('words')
    expect(sectionForPath('/vocabulary/42')).toBe('words')
    expect(sectionForPath('/study')).toBe('words')
  })

  it('falls back to the collection', () => {
    expect(sectionForPath('/unknown')).toBe('collection')
    expect(sectionForPath('/login')).toBe('collection')
  })
})

describe('normalizeTheme', () => {
  it('keeps valid values', () => {
    const theme = normalizeTheme({
      mode: 'custom',
      custom: { bg: '#112233', surface: '#223344', text: '#ffffff' },
      sections: { chat: '#ff0000' },
      fonts: { ui: 'manrope', reading: 'lora', size: 'l' },
    })
    expect(theme.mode).toBe('custom')
    expect(theme.custom.bg).toBe('#112233')
    expect(theme.sections.chat).toBe('#ff0000')
    expect(theme.sections.reader).toBe(DEFAULT_THEME.sections.reader)
    expect(theme.fonts).toEqual({ ui: 'manrope', reading: 'lora', size: 'l' })
  })

  it('falls back for broken input', () => {
    const theme = normalizeTheme({ mode: 'neon', custom: { bg: 'red' }, fonts: { ui: 'comic' } })
    expect(theme.mode).toBe('system')
    expect(theme.custom).toEqual(DEFAULT_THEME.custom)
    expect(theme.fonts).toEqual(DEFAULT_THEME.fonts)
    expect(theme.sections).toEqual(DEFAULT_THEME.sections)
  })

  it('uses the profile theme as a fallback mode', () => {
    expect(normalizeTheme(null, 'light').mode).toBe('light')
    expect(normalizeTheme({ mode: 'custom' }, 'light').mode).toBe('custom')
  })
})

describe('resolveTheme', () => {
  it('adds base variables only for the custom mode', () => {
    expect(resolveTheme({ ...DEFAULT_THEME, mode: 'dark' }, 'dark').base).toBeNull()
    const custom = resolveTheme(
      { ...DEFAULT_THEME, mode: 'custom', custom: { bg: '#101010', surface: '#202020', text: '#f5f5f5' } },
      'dark',
    )
    expect(custom.base?.['--bg']).toBe('#101010')
    expect(custom.base?.['--surface']).toBe('#202020')
    expect(custom.sections.chat['--accent']).toBeTruthy()
  })

  it('detects the custom theme from the background', () => {
    expect(customThemeOf({ ...DEFAULT_THEME, custom: { bg: '#fafafa', surface: '#fff', text: '#111' } })).toBe('light')
    expect(customThemeOf({ ...DEFAULT_THEME, custom: { bg: '#111111', surface: '#222', text: '#eee' } })).toBe('dark')
  })
})

describe('theme colors', () => {
  it('validates hex values', () => {
    expect(normalizeHex('#AB12CD', '#000000')).toBe('#ab12cd')
    expect(normalizeHex('red', '#000000')).toBe('#000000')
    expect(normalizeHex(null, '#000000')).toBe('#000000')
  })

  it('computes contrast and readable text colors', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeGreaterThan(20)
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1)
    expect(readableOn('#101010')).toBe('#ffffff')
    expect(readableOn('#f5f5f5')).toBe('#101014')
  })

  it('raises low contrast accents', () => {
    const fixed = ensureContrast('#ffff00', '#ffffff', 3)
    expect(contrastRatio(fixed, '#ffffff')).toBeGreaterThanOrEqual(3)
  })
})
