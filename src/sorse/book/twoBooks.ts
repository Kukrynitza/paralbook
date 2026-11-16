import { gunzipSync } from 'fflate'
import { MAX_TWO_BOOKS_PAGES } from '@/sorse/uploadLimits'
import { unzipSelected } from './zip'

export interface TwoBooksMeta {
  version: number
  isMonolingual: boolean
  title: string
  author: string | null
  description: string
  titleRu: string
  mainLang: string
  secondaryLang: string
  pages: number
}

export interface TwoBooksPage {
  en: { text: string; align: number | null }[]
  ru: { text: string }[]
}

export interface TwoBooksPageFile {
  position: number
  data: Uint8Array
}

export interface TwoBooksBook {
  meta: TwoBooksMeta
  pages: TwoBooksPageFile[]
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function zipOffset(bytes: Uint8Array) {
  const limit = Math.min(bytes.length - 4, 4096)
  for (let index = 0; index <= limit; index += 1) {
    if (bytes[index] === 0x50 && bytes[index + 1] === 0x4b && bytes[index + 2] === 0x03 && bytes[index + 3] === 0x04) {
      return index
    }
  }
  throw new Error('Файл .2books повреждён: не найден ZIP')
}

function pageNumber(name: string) {
  const match = /^pages\/(\d+)\.json\.gz$/i.exec(name)
  return match ? Number(match[1]) : null
}

function readToken(value: unknown) {
  const parts = Array.isArray(value) ? value : []
  return {
    word: asString(parts[0]),
    prefix: asString(parts[1]),
    suffix: asString(parts[2]),
    link: parts[3],
  }
}

function gzipSize(data: Uint8Array) {
  if (data.length < 4) return 0
  return new DataView(data.buffer, data.byteOffset + data.length - 4, 4).getUint32(0, true)
}

export function readTwoBooksMeta(bytes: Uint8Array): TwoBooksMeta {
  const zip = bytes.subarray(zipOffset(bytes))
  let pageCount = 0
  const files = unzipSelected(zip, (name) => {
    const lower = name.toLowerCase()
    if (/^pages\/\d+\.json\.gz$/.test(lower)) {
      pageCount += 1
      return false
    }
    return lower === 'meta.json'
  })
  const key = Object.keys(files).find((name) => name.toLowerCase() === 'meta.json')
  if (!key) throw new Error('В файле .2books нет meta.json')
  let raw: unknown
  try {
    raw = JSON.parse(new TextDecoder().decode(files[key]))
  } catch {
    throw new Error('Не удалось прочитать meta.json')
  }
  if (!isRecord(raw)) throw new Error('Некорректный meta.json')
  const main = isRecord(raw.main) ? raw.main : {}
  const secondary = isRecord(raw.secondary) ? raw.secondary : {}
  const share = isRecord(raw.share) ? raw.share : {}
  return {
    version: asNumber(raw.version) || 1,
    isMonolingual: Boolean(raw.isMonolingual),
    title: asString(main.title),
    author: asString(main.author) || null,
    description: asString(main.description),
    titleRu: asString(secondary.title),
    mainLang: asString(main.lang).toUpperCase(),
    secondaryLang: asString(secondary.lang).toUpperCase(),
    pages: pageCount || asNumber(share.pages),
  }
}

export function openTwoBooks(bytes: Uint8Array): TwoBooksBook {
  const meta = readTwoBooksMeta(bytes)
  const zip = bytes.subarray(zipOffset(bytes))
  const files = unzipSelected(zip, (name) => /^pages\/\d+\.json\.gz$/i.test(name))
  const pages = Object.entries(files)
    .map(([name, data]) => ({ number: pageNumber(name), data }))
    .filter((item) => item.number !== null)
    .sort((left, right) => (left.number ?? 0) - (right.number ?? 0))
    .map((item, position) => ({ position, data: item.data }))
  if (!pages.length) throw new Error('В файле .2books не найдены страницы')
  if (pages.length > MAX_TWO_BOOKS_PAGES) {
    throw new Error(`В книге слишком много страниц. Максимум — ${MAX_TWO_BOOKS_PAGES}.`)
  }
  return { meta: { ...meta, pages: meta.pages || pages.length }, pages }
}

export function decodeTwoBooksPage(data: Uint8Array, position = 0): TwoBooksPage {
  if (gzipSize(data) > 20 * 1024 * 1024) {
    throw new Error(`Страница ${position + 1} слишком большая`)
  }
  let raw: unknown
  try {
    raw = JSON.parse(new TextDecoder().decode(gunzipSync(data)))
  } catch {
    throw new Error(`Не удалось прочитать страницу ${position + 1}`)
  }
  const record = isRecord(raw) ? raw : {}
  const ruRaw = Array.isArray(record.tokens2) ? record.tokens2 : []
  const enRaw = Array.isArray(record.tokens1) ? record.tokens1 : []
  const ru = ruRaw.map((item) => {
    const { word, prefix, suffix } = readToken(item)
    const text = `${prefix}${word}${suffix}`.trim()
    if (!text) throw new Error(`Пустой русский токен на странице ${position + 1}`)
    return { text }
  })
  const enCount = enRaw.length
  const ruCount = ru.length
  const en: TwoBooksPage['en'] = []
  for (const item of enRaw) {
    const { word, prefix, suffix, link } = readToken(item)
    const text = `${prefix}${word}${suffix}`
    if (!text.trim()) throw new Error(`Пустой английский токен на странице ${position + 1}`)
    const ruIndex = typeof link === 'number' && Number.isInteger(link) && link >= 0 && link < ruCount ? link : null
    const align =
      ruIndex === null || !enCount || !ruCount
        ? null
        : Math.min(enCount - 1, Math.max(0, Math.ceil((ruIndex * enCount) / ruCount)))
    for (const part of text.split(/(\s+)/)) {
      if (!part) continue
      en.push({ text: part, align: part.trim() ? align : null })
    }
  }
  return { en, ru }
}
