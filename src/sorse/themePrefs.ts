import { FONTS, READER_SIZES, type FontId } from '@/sorse/fonts'
import {
  DARK_PALETTE,
  LIGHT_PALETTE,
  customThemeOf,
  normalizeTheme,
  resolveTheme,
  sectionForPath,
  type ResolvedTheme,
  type ThemePrefs,
} from '@/sorse/themeTypes'

const STORAGE_KEY = 'paralbook.theme.v1'

const BASE_KEYS = ['--bg', '--bar', '--surface', '--input', '--border', '--text', '--muted', '--canvas', '--shadow']
const ACCENT_KEYS = ['--accent', '--accent-soft', '--on-accent']
const FONT_KEYS = ['--ui-font', '--reading-font', '--reader-size']

export interface ThemeCache {
  prefs: ThemePrefs
  customTheme: 'dark' | 'light'
  resolved: { dark: ResolvedTheme; light: ResolvedTheme }
}

export function buildCache(prefs: ThemePrefs): ThemeCache {
  return {
    prefs,
    customTheme: customThemeOf(prefs),
    resolved: { dark: resolveTheme(prefs, 'dark'), light: resolveTheme(prefs, 'light') },
  }
}

export function readThemeCache(): ThemeCache | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as { prefs?: unknown }
    return buildCache(normalizeTheme(value.prefs))
  } catch {
    return null
  }
}

export function writeThemeCache(cache: ThemeCache) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch {
    // localStorage может быть недоступен
  }
}

export function clearThemeCache() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // localStorage может быть недоступен
  }
}

export function themeName(prefs: ThemePrefs): 'dark' | 'light' {
  if (prefs.mode === 'light') return 'light'
  if (prefs.mode === 'dark') return 'dark'
  if (prefs.mode === 'custom') return customThemeOf(prefs)
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyFonts(root: HTMLElement, ui: FontId, reading: FontId, size: keyof typeof READER_SIZES) {
  const uiFont = FONTS[ui]
  const readingFont = FONTS[reading]
  if (uiFont.variable) root.style.setProperty('--ui-font', `var(${uiFont.variable})`)
  else root.style.setProperty('--ui-font', 'system-ui')
  if (readingFont.variable) root.style.setProperty('--reading-font', `var(${readingFont.variable})`)
  else root.style.setProperty('--reading-font', 'system-ui')
  root.style.setProperty('--reader-size', READER_SIZES[size])
}

export function applyTheme(prefs: ThemePrefs, pathname: string) {
  if (typeof document === 'undefined') return null
  const root = document.documentElement
  const cache = buildCache(prefs)
  const theme = themeName(prefs)
  const resolved = cache.resolved[theme]
  for (const key of BASE_KEYS) root.style.removeProperty(key)
  if (resolved.base) {
    for (const [key, value] of Object.entries(resolved.base)) root.style.setProperty(key, value)
  }
  const section = sectionForPath(pathname)
  for (const key of ACCENT_KEYS) root.style.removeProperty(key)
  for (const [key, value] of Object.entries(resolved.sections[section])) root.style.setProperty(key, value)
  applyFonts(root, prefs.fonts.ui, prefs.fonts.reading, prefs.fonts.size)
  root.dataset.theme = theme
  root.dataset.section = section
  root.style.colorScheme = theme
  writeThemeCache(cache)
  return cache
}

export function clearAppliedTheme() {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  for (const key of [...BASE_KEYS, ...ACCENT_KEYS, ...FONT_KEYS]) root.style.removeProperty(key)
  root.dataset.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  delete root.dataset.section
  root.style.colorScheme = root.dataset.theme
  clearThemeCache()
}

export function paletteFor(prefs: ThemePrefs): { bg: string; surface: string; text: string } {
  if (prefs.mode === 'custom') return prefs.custom
  return themeName(prefs) === 'dark' ? DARK_PALETTE : LIGHT_PALETTE
}
