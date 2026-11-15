import { decodeBytes } from './decode'
import type { BookDraft } from './types'
import { entryMap, getEntry, unzipSelected } from './zip'

const WORD_NAMESPACE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const SKIP = new Set(['del', 'instrText', 'delText', 'deletedText'])

function append(node: Node, parts: string[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    parts.push(node.nodeValue ?? '')
    return
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return
  const element = node as Element
  const name = element.localName
  if (SKIP.has(name)) return
  if (name === 'tab') {
    parts.push('\t')
    return
  }
  if (name === 'br' || name === 'cr') {
    parts.push('\n')
    return
  }
  if (name === 'noBreakHyphen') {
    parts.push('-')
    return
  }
  for (const child of Array.from(element.childNodes)) append(child, parts)
}

export function parseDocx(bytes: Uint8Array): BookDraft {
  const files = entryMap(unzipSelected(bytes, (name) => name.toLowerCase() === 'word/document.xml'))
  const source = getEntry(files, 'word/document.xml')
  if (!source) throw new Error('В DOCX не найден файл word/document.xml')
  const doc = new DOMParser().parseFromString(decodeBytes(source, 'utf-8'), 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error('Не удалось разобрать DOCX: файл повреждён')
  }
  const named = Array.from(doc.getElementsByTagNameNS(WORD_NAMESPACE, 'p'))
  const paragraphs = named.length
    ? named
    : Array.from(doc.getElementsByTagName('*')).filter((item) => item.localName === 'p')
  const parts: string[] = []
  for (const paragraph of paragraphs) {
    const text: string[] = []
    append(paragraph, text)
    const value = text.join('').trim()
    if (value) parts.push(value)
  }
  if (!parts.length) throw new Error('В DOCX не нашлось текста')
  return { text: parts.join('\n\n') }
}
