const ENCODINGS: Record<string, string> = {
  'utf-8': 'utf-8',
  utf8: 'utf-8',
  'unicode-1-1-utf-8': 'utf-8',
  'utf-16': 'utf-16le',
  'utf-16le': 'utf-16le',
  'utf-16be': 'utf-16be',
  'windows-1251': 'windows-1251',
  'cp1251': 'windows-1251',
  'win-1251': 'windows-1251',
  'x-cp1251': 'windows-1251',
  'windows-1252': 'windows-1252',
  'cp1252': 'windows-1252',
  latin1: 'windows-1252',
  'iso-8859-1': 'windows-1252',
  'us-ascii': 'windows-1252',
  'koi8-r': 'koi8-r',
  koi8r: 'koi8-r',
}

function decodeAs(bytes: Uint8Array, label: string, fatal = false) {
  try {
    return new TextDecoder(label, { fatal }).decode(bytes)
  } catch {
    return null
  }
}

function normalizeEncoding(raw: string | null | undefined) {
  if (!raw) return null
  const value = raw.trim().toLowerCase().replace(/^["']|["']$/g, '')
  return ENCODINGS[value] ?? null
}

function declaredEncoding(bytes: Uint8Array) {
  const head = new TextDecoder('windows-1252').decode(bytes.subarray(0, Math.min(bytes.length, 4096)))
  const xml = /<\?xml[^>]*?encoding\s*=\s*["']\s*([^"']+?)\s*["']/i.exec(head)
  if (xml?.[1]) return xml[1]
  const meta = /<meta[^>]+charset\s*=\s*["']?\s*([a-z0-9._-]+)/i.exec(head)
  if (meta?.[1]) return meta[1]
  const content = /<meta[^>]+content\s*=\s*["'][^"']*charset\s*=\s*([a-z0-9._-]+)/i.exec(head)
  return content?.[1] ?? null
}

function cyrillicCount(text: string) {
  return (text.match(/[\u0400-\u04FF]/g) ?? []).length
}

function stripBom(text: string) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

export function decodeBytes(bytes: Uint8Array, hint?: string | null) {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return stripBom(decodeAs(bytes.subarray(3), 'utf-8') ?? '')
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return stripBom(decodeAs(bytes.subarray(2), 'utf-16le') ?? '')
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return stripBom(decodeAs(bytes.subarray(2), 'utf-16be') ?? '')
  }

  const label = normalizeEncoding(hint) ?? normalizeEncoding(declaredEncoding(bytes))
  if (label && label !== 'utf-8') {
    const utf8 = decodeAs(bytes, 'utf-8', true)
    if (utf8 !== null && /[^\x00-\x7F]/.test(utf8)) return stripBom(utf8)
  }
  if (label) {
    const exact = decodeAs(bytes, label, true)
    if (exact !== null) return stripBom(exact)
    if (label !== 'utf-8') {
      const loose = decodeAs(bytes, label)
      if (loose !== null) return stripBom(loose)
    }
  }

  const utf8 = decodeAs(bytes, 'utf-8', true)
  if (utf8 !== null) return stripBom(utf8)

  const cp1251 = decodeAs(bytes, 'windows-1251') ?? ''
  const cp1252 = decodeAs(bytes, 'windows-1252') ?? ''
  return stripBom(cyrillicCount(cp1251) > cyrillicCount(cp1252) ? cp1251 : cp1252)
}

export function normalizeText(text: string) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\uFEFF/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ +\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
