import { baseVars, accentVars, luminance, normalizeHex } from '@/sorse/themeColors'
import { isFontId, isReaderSize, type FontId, type ReaderSize } from '@/sorse/fonts'

export type ThemeMode = 'system' | 'light' | 'dark' | 'custom'

export type SectionId =
  | 'collection'
  | 'library'
  | 'chat'
  | 'reader'
  | 'add'
  | 'words'
  | 'stats'
  | 'friends'
  | 'settings'

export interface SectionTheme {
  id: SectionId
  label: string
  hint: string
}

export const SECTIONS: SectionTheme[] = [
  { id: 'collection', label: 'Подборка', hint: 'главная' },
  { id: 'library', label: 'Библиотека', hint: 'опубликованные тексты' },
  { id: 'chat', label: 'Чат', hint: 'генерация' },
  { id: 'reader', label: 'Читалка', hint: 'страницы книги' },
  { id: 'add', label: 'Добавить', hint: 'файл и ручной ввод' },
  { id: 'words', label: 'Словарь и тренировка', hint: 'слова' },
  { id: 'stats', label: 'Статистика', hint: 'графики' },
  { id: 'friends', label: 'Друзья', hint: 'минуты' },
  { id: 'settings', label: 'Настройки', hint: 'профиль и тема' },
]

export const SECTION_IDS = SECTIONS.map((item) => item.id)

export const SECTION_ROUTES: { prefix: string; section: SectionId }[] = [
  { prefix: '/library', section: 'library' },
  { prefix: '/chat', section: 'chat' },
  { prefix: '/read', section: 'reader' },
  { prefix: '/text', section: 'add' },
  { prefix: '/vocabulary', section: 'words' },
  { prefix: '/study', section: 'words' },
  { prefix: '/stats', section: 'stats' },
  { prefix: '/friends', section: 'friends' },
  { prefix: '/settings', section: 'settings' },
]

export const DEFAULT_SECTIONS: Record<SectionId, string> = {
  collection: '#ff6229',
  library: '#d99a1a',
  chat: '#3b82f6',
  reader: '#8b5cf6',
  add: '#14b8a6',
  words: '#22a06b',
  stats: '#6366f1',
  friends: '#ec4899',
  settings: '#64748b',
}

export const ACCENT_COLORS = [
  '#ff6229',
  '#d99a1a',
  '#3b82f6',
  '#8b5cf6',
  '#14b8a6',
  '#22a06b',
  '#6366f1',
  '#ec4899',
  '#64748b',
  '#f43f5e',
  '#0ea5e9',
  '#84cc16',
]

export interface ThemePalette {
  bg: string
  surface: string
  text: string
}

export const DARK_PALETTE: ThemePalette = { bg: '#18181a', surface: '#242426', text: '#ffffff' }
export const LIGHT_PALETTE: ThemePalette = { bg: '#fafafa', surface: '#f0f0f2', text: '#18181a' }

export const DEFAULT_THEME_CUSTOM = DARK_PALETTE

export interface ThemePrefs {
  version: 1
  mode: ThemeMode
  custom: ThemePalette
  sections: Record<SectionId, string>
  fonts: { ui: FontId; reading: FontId; size: ReaderSize }
}

export const DEFAULT_THEME: ThemePrefs = {
  version: 1,
  mode: 'system',
  custom: DEFAULT_THEME_CUSTOM,
  sections: DEFAULT_SECTIONS,
  fonts: { ui: 'inter', reading: 'inter', size: 'm' },
}

export const THEME_PRESETS: { id: string; label: string; hint: string; palette: ThemePalette }[] = [
  { id: 'night', label: 'Ночная', hint: 'как сейчас', palette: DARK_PALETTE },
  { id: 'graphite', label: 'Графит', hint: 'мягкая тёмная', palette: { bg: '#202124', surface: '#2b2c30', text: '#f1f1f3' } },
  { id: 'sepia', label: 'Сепия', hint: 'тёплая светлая', palette: { bg: '#f6f0e4', surface: '#efe6d6', text: '#2b2416' } },
  { id: 'forest', label: 'Лес', hint: 'тёмно-зелёная', palette: { bg: '#0f1b16', surface: '#17261f', text: '#eaf5ee' } },
  { id: 'ocean', label: 'Океан', hint: 'тёмно-синяя', palette: { bg: '#0e1620', surface: '#152231', text: '#e8f1fa' } },
  { id: 'contrast', label: 'Контраст', hint: 'чёрное на белом', palette: { bg: '#000000', surface: '#111111', text: '#ffffff' } },
]

export function sectionForPath(pathname: string): SectionId {
  for (const route of SECTION_ROUTES) {
    if (pathname === route.prefix || pathname.startsWith(`${route.prefix}/`)) return route.section
  }
  return 'collection'
}

export function customThemeOf(prefs: ThemePrefs): 'dark' | 'light' {
  return luminance(prefs.custom.bg) > 0.45 ? 'light' : 'dark'
}

export interface ResolvedTheme {
  base: Record<string, string> | null
  sections: Record<SectionId, Record<string, string>>
}

export function resolveTheme(prefs: ThemePrefs, theme: 'dark' | 'light'): ResolvedTheme {
  const custom = prefs.mode === 'custom'
  const background = custom ? prefs.custom.bg : theme === 'dark' ? DARK_PALETTE.bg : LIGHT_PALETTE.bg
  const sections = {} as Record<SectionId, Record<string, string>>
  for (const id of SECTION_IDS) {
    sections[id] = accentVars(prefs.sections[id], theme, background)
  }
  return { base: custom ? baseVars(prefs.custom, theme) : null, sections }
}

function isMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark' || value === 'custom'
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

export function normalizeTheme(value: unknown, fallbackMode: ThemeMode = 'system'): ThemePrefs {
  const source = record(value)
  const custom = record(source.custom)
  const sections = record(source.sections)
  const fonts = record(source.fonts)
  return {
    version: 1,
    mode: isMode(source.mode) ? source.mode : fallbackMode,
    custom: {
      bg: normalizeHex(custom.bg, DEFAULT_THEME.custom.bg),
      surface: normalizeHex(custom.surface, DEFAULT_THEME.custom.surface),
      text: normalizeHex(custom.text, DEFAULT_THEME.custom.text),
    },
    sections: Object.fromEntries(
      SECTION_IDS.map((id) => [id, normalizeHex(sections[id], DEFAULT_THEME.sections[id])]),
    ) as Record<SectionId, string>,
    fonts: {
      ui: isFontId(fonts.ui) ? fonts.ui : DEFAULT_THEME.fonts.ui,
      reading: isFontId(fonts.reading) ? fonts.reading : DEFAULT_THEME.fonts.reading,
      size: isReaderSize(fonts.size) ? fonts.size : DEFAULT_THEME.fonts.size,
    },
  }
}
