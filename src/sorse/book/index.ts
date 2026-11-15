// Разбор книг выполняется в браузере: модуль использует File и DOMParser.
// Импортировать его можно только из клиентских компонентов ('use client').

import { MAX_UPLOAD_BYTES, MAX_UPLOAD_TEXT, MIN_UPLOAD_TEXT } from '@/sorse/uploadLimits'
import { normalizeText } from './decode'
import { parseDocx } from './docx'
import { parseEpub } from './epub'
import { parseFb2 } from './fb2'
import { parseMarkdown, parseText } from './text'
import type { BookDraft, BookFormat, ParsedBook } from './types'
import { entryMap, unzipSelected } from './zip'

export type { BookFormat, ParsedBook } from './types'

const EXTENSIONS: Record<string, BookFormat> = {
  txt: 'txt',
  text: 'txt',
  md: 'md',
  markdown: 'md',
  fb2: 'fb2',
  epub: 'epub',
  docx: 'docx',
}

const MIME_TYPES: Record<string, BookFormat> = {
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/x-markdown': 'md',
  'application/x-fictionbook+xml': 'fb2',
  'application/epub+zip': 'epub',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
}

const HTML_EXTENSIONS = new Set(['html', 'htm', 'xhtml'])

function extensionOf(name: string) {
  const match = /\.([^.\\/]+)$/.exec(name.trim())
  return match ? match[1].toLowerCase() : ''
}

function headText(bytes: Uint8Array, size = 2048) {
  return new TextDecoder('windows-1252').decode(bytes.subarray(0, Math.min(size, bytes.length)))
}

function isZip(bytes: Uint8Array) {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07)
  )
}

function looksTextual(bytes: Uint8Array) {
  const sample = bytes.subarray(0, 4096)
  let control = 0
  for (const byte of sample) {
    if (byte === 0) return false
    if (byte < 9 || (byte > 13 && byte < 32)) control += 1
  }
  return control <= sample.length * 0.01
}

function zipFormat(bytes: Uint8Array): BookFormat {
  const files = entryMap(
    unzipSelected(bytes, (name) => {
      const lower = name.toLowerCase()
      return (
        lower === 'mimetype' ||
        lower === 'meta-inf/container.xml' ||
        lower === '[content_types].xml' ||
        lower === 'word/document.xml'
      )
    }),
  )
  const mime = files.get('mimetype')
  if (mime) {
    const value = new TextDecoder('windows-1252').decode(mime).trim().toLowerCase()
    if (value.includes('epub')) return 'epub'
  }
  if (files.has('meta-inf/container.xml')) return 'epub'
  if (files.has('word/document.xml')) return 'docx'
  const types = files.get('[content_types].xml')
  if (types) {
    const value = new TextDecoder('windows-1252').decode(types).toLowerCase()
    if (value.includes('wordprocessingml')) return 'docx'
    if (value.includes('epub')) return 'epub'
  }
  throw new Error('Не удалось определить формат архива. Поддерживаются EPUB и DOCX.')
}

export function detectFormat(file: File, bytes: Uint8Array): BookFormat {
  const head = headText(bytes)
  if (head.trimStart().startsWith('%PDF-')) {
    throw new Error('PDF не поддерживается. Сохраните текст в EPUB, DOCX или текстовом файле.')
  }
  const extension = extensionOf(file.name)
  const byExtension = EXTENSIONS[extension]
  if (isZip(bytes)) return zipFormat(bytes)
  if (/<FictionBook[\s>]/i.test(head)) return 'fb2'
  if (HTML_EXTENSIONS.has(extension) || /<html[\s>]/i.test(head) || /<!doctype\s+html/i.test(head)) {
    throw new Error('HTML не поддерживается. Загрузите FB2, EPUB, DOCX, Markdown или TXT.')
  }
  if (byExtension) return byExtension
  const byMime = MIME_TYPES[(file.type || '').toLowerCase()]
  if (byMime) return byMime
  if (looksTextual(bytes)) return 'txt'
  throw new Error('Формат не поддерживается. Загрузите FB2, EPUB, DOCX, Markdown или TXT.')
}

function parseByFormat(format: BookFormat, bytes: Uint8Array): BookDraft {
  switch (format) {
    case 'fb2':
      return parseFb2(bytes)
    case 'epub':
      return parseEpub(bytes)
    case 'docx':
      return parseDocx(bytes)
    case 'md':
      return parseMarkdown(bytes)
    case 'txt':
      return parseText(bytes)
  }
}

function finish(file: File, format: BookFormat, draft: BookDraft): ParsedBook {
  const text = normalizeText(draft.text)
  if (!text) throw new Error('В файле не нашлось текста')
  if (text.length < MIN_UPLOAD_TEXT) throw new Error('В файле слишком мало текста')
  if (text.length > MAX_UPLOAD_TEXT) {
    throw new Error(
      `Текст слишком длинный: ${text.length.toLocaleString('ru-RU')} символов. Максимум — ${MAX_UPLOAD_TEXT.toLocaleString('ru-RU')}.`,
    )
  }
  const fallbackTitle = file.name.replace(/\.[^.]+$/, '').replace(/\s+/g, ' ').trim()
  const title = (draft.title?.replace(/\s+/g, ' ').trim() || fallbackTitle || 'Свой текст').slice(0, 80)
  const author = draft.author?.replace(/\s+/g, ' ').trim().slice(0, 120) || null
  return { title, author, format, text, warnings: draft.warnings ?? [] }
}

export async function parseBook(file: File): Promise<ParsedBook> {
  if (!file.size) throw new Error('Файл пустой')
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`Файл слишком большой. Максимум — ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} МБ.`)
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const format = detectFormat(file, bytes)
  return finish(file, format, parseByFormat(format, bytes))
}
