import { decodeBytes } from './decode'
import type { BookDraft } from './types'

const BLOCKS = new Set(['p', 'v', 'subtitle', 'text-author', 'title', 'epigraph', 'cite', 'annotation', 'poem', 'stanza'])
const SKIP = new Set(['binary', 'description', 'stylesheet', 'script'])

function elements(root: Document | Element) {
  return Array.from(root.getElementsByTagName('*'))
}

function firstText(root: Document | Element, name: string) {
  return elements(root).find((item) => item.localName === name)?.textContent?.trim() ?? ''
}

function authorOf(doc: Document) {
  const info = elements(doc).find((item) => item.localName === 'title-info')
  const source: Document | Element = info ?? doc
  const names: string[] = []
  for (const author of elements(source).filter((item) => item.localName === 'author')) {
    const parts = ['first-name', 'middle-name', 'last-name', 'nickname']
      .map((name) => elements(author).find((item) => item.localName === name)?.textContent?.trim())
      .filter(Boolean)
    if (parts.length) names.push(parts.join(' '))
  }
  return [...new Set(names)].join(', ') || null
}

function append(node: Node, parts: string[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    parts.push(node.nodeValue ?? '')
    return
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return
  const element = node as Element
  const name = element.localName.toLowerCase()
  if (SKIP.has(name)) return
  if (name === 'empty-line') {
    parts.push('\n\n')
    return
  }
  for (const child of Array.from(element.childNodes)) append(child, parts)
  if (BLOCKS.has(name)) parts.push('\n\n')
}

export function parseFb2(bytes: Uint8Array): BookDraft {
  const doc = new DOMParser().parseFromString(decodeBytes(bytes), 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error('Не удалось разобрать FB2: файл повреждён или это не XML')
  }
  const root = doc.documentElement
  const bodies = elements(doc).filter((item) => item.localName === 'body')
  if (!root || root.localName.toLowerCase() !== 'fictionbook') {
    throw new Error('Это не FB2: не найден корневой элемент FictionBook')
  }
  if (!bodies.length) throw new Error('В FB2 не найден текст книги')
  const parts: string[] = []
  for (const body of bodies) append(body, parts)
  return {
    title: firstText(doc, 'book-title'),
    author: authorOf(doc),
    text: parts.join(''),
  }
}
