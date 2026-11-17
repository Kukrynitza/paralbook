export const FONTS = {
  system: { label: 'Системный', hint: 'Как в устройстве', variable: '' },
  inter: { label: 'Inter', hint: 'Нейтральный', variable: '--font-inter' },
  manrope: { label: 'Manrope', hint: 'Геометрический', variable: '--font-manrope' },
  onest: { label: 'Onest', hint: 'Современный', variable: '--font-onest' },
  nunito: { label: 'Nunito', hint: 'Мягкий', variable: '--font-nunito' },
  rubik: { label: 'Rubik', hint: 'Округлый', variable: '--font-rubik' },
  plex: { label: 'IBM Plex Sans', hint: 'Техничный', variable: '--font-plex' },
  unbounded: { label: 'Unbounded', hint: 'Плакатный', variable: '--font-unbounded' },
  russo: { label: 'Russo One', hint: 'Стрит-арт', variable: '--font-russo' },
  oswald: { label: 'Oswald', hint: 'Афиша', variable: '--font-oswald' },
  kelly: { label: 'Kelly Slab', hint: 'Декор', variable: '--font-kelly' },
  ruslan: { label: 'Ruslan Display', hint: 'Граффити', variable: '--font-ruslan' },
  caveat: { label: 'Caveat', hint: 'Рукописный', variable: '--font-caveat' },
  badscript: { label: 'Bad Script', hint: 'Каллиграфия', variable: '--font-badscript' },
  marck: { label: 'Marck Script', hint: 'Почерк', variable: '--font-marck' },
  jetbrains: { label: 'JetBrains Mono', hint: 'Моноширинный', variable: '--font-jetbrains' },
  lora: { label: 'Lora', hint: 'Классика', variable: '--font-lora' },
  literata: { label: 'Literata', hint: 'Для чтения', variable: '--font-literata' },
  sourceserif: { label: 'Source Serif 4', hint: 'Книжный', variable: '--font-sourceserif' },
  ptserif: { label: 'PT Serif', hint: 'Русская классика', variable: '--font-ptserif' },
  cormorant: { label: 'Cormorant', hint: 'Барокко', variable: '--font-cormorant' },
  playfair: { label: 'Playfair Display', hint: 'Барочный контраст', variable: '--font-playfair' },
  prata: { label: 'Prata', hint: 'Дидо', variable: '--font-prata' },
} as const

export type FontId = keyof typeof FONTS

export const UI_FONTS: FontId[] = [
  'system',
  'inter',
  'manrope',
  'onest',
  'nunito',
  'rubik',
  'plex',
  'unbounded',
  'russo',
  'oswald',
  'kelly',
  'ruslan',
  'caveat',
  'badscript',
  'marck',
  'jetbrains',
]

export const READING_FONTS: FontId[] = [
  'system',
  'inter',
  'lora',
  'literata',
  'sourceserif',
  'ptserif',
  'cormorant',
  'playfair',
  'prata',
]

export const FONT_IDS = Object.keys(FONTS) as FontId[]

export function isFontId(value: unknown): value is FontId {
  return typeof value === 'string' && FONT_IDS.includes(value as FontId)
}

export const FONT_VARS = Object.fromEntries(
  FONT_IDS.filter((id) => FONTS[id].variable).map((id) => [id, FONTS[id].variable]),
) as Record<Exclude<FontId, 'system'>, string>

export const READER_SIZES = { s: '17px', m: '19px', l: '22px' } as const

export type ReaderSize = keyof typeof READER_SIZES

export function isReaderSize(value: unknown): value is ReaderSize {
  return value === 's' || value === 'm' || value === 'l'
}
