import { decodeBytes } from './decode'
import { htmlToText } from './html'
import type { BookDraft } from './types'
import { directoryOf, entryMap, getEntry, resolvePath, unzipSelected } from './zip'

interface ManifestItem {
  href: string
  mediaType: string
  properties: string
}

function elements(root: Document | Element) {
  return Array.from(root.getElementsByTagName('*'))
}

function firstText(root: Document | Element, name: string) {
  return elements(root).find((item) => item.localName === name)?.textContent?.trim() ?? ''
}

function parseXml(bytes: Uint8Array, label: string) {
  const doc = new DOMParser().parseFromString(decodeBytes(bytes), 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error(`Не удалось разобрать ${label}: файл повреждён`)
  }
  return doc
}

function decodePath(path: string) {
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

export function parseEpub(bytes: Uint8Array): BookDraft {
  const first = entryMap(
    unzipSelected(bytes, (name) => {
      const lower = name.toLowerCase()
      return lower === 'meta-inf/container.xml' || lower.endsWith('.opf')
    }),
  )
  const containerBytes = getEntry(first, 'META-INF/container.xml')
  if (!containerBytes) throw new Error('В EPUB не найден META-INF/container.xml')
  const container = parseXml(containerBytes, 'container.xml')
  const fromContainer = elements(container)
    .filter((item) => item.localName === 'rootfile')
    .map((item) => decodePath(item.getAttribute('full-path') ?? ''))
    .find((path) => path && getEntry(first, path))
  let opfPath = fromContainer
  if (!opfPath) {
    const fallback = Array.from(first.keys()).find((name) => name.toLowerCase().endsWith('.opf'))
    opfPath = fallback ? decodePath(fallback) : undefined
  }
  if (!opfPath) throw new Error('В EPUB не найден OPF-файл')
  const opfBytes = getEntry(first, opfPath)
  if (!opfBytes) throw new Error('В EPUB не найден OPF-файл')
  const opf = parseXml(opfBytes, 'OPF')

  const manifest = new Map<string, ManifestItem>()
  for (const item of elements(opf)) {
    if (item.localName !== 'item') continue
    const id = item.getAttribute('id')
    const href = item.getAttribute('href')
    if (!id || !href) continue
    manifest.set(id, {
      href,
      mediaType: (item.getAttribute('media-type') ?? '').toLowerCase(),
      properties: (item.getAttribute('properties') ?? '').toLowerCase(),
    })
  }

  const base = directoryOf(opfPath)
  const paths: string[] = []
  const warnings: string[] = []
  for (const ref of elements(opf)) {
    if (ref.localName !== 'itemref') continue
    if ((ref.getAttribute('linear') ?? 'yes').toLowerCase() === 'no') continue
    const idref = ref.getAttribute('idref')
    if (!idref) continue
    const item = manifest.get(idref)
    if (!item) {
      warnings.push(`В EPUB пропущена глава: ${idref}`)
      continue
    }
    if (item.properties.split(/\s+/).includes('nav')) continue
    if (item.mediaType && !/xhtml|html/.test(item.mediaType)) continue
    const path = resolvePath(base, item.href)
    if (path && !paths.includes(path)) paths.push(path)
  }
  if (!paths.length) throw new Error('В EPUB не найдены главы с текстом')

  const wanted = new Set(paths.map((path) => path.toLowerCase()))
  const second = entryMap(unzipSelected(bytes, (name) => wanted.has(name.toLowerCase())))
  const parts: string[] = []
  for (const path of paths) {
    const source = getEntry(second, path)
    if (!source) {
      warnings.push(`В EPUB не найден файл главы: ${path}`)
      continue
    }
    const { text } = htmlToText(decodeBytes(source))
    if (text.trim()) parts.push(text)
  }
  if (!parts.length) throw new Error('В EPUB не нашлось текста')
  return {
    title: firstText(opf, 'title'),
    author: firstText(opf, 'creator') || null,
    text: parts.join('\n\n'),
    warnings,
  }
}
