import { decodeBytes } from './decode'
import type { BookDraft } from './types'

export function parseText(bytes: Uint8Array): BookDraft {
  return { text: decodeBytes(bytes) }
}

export function parseMarkdown(bytes: Uint8Array): BookDraft {
  return { text: markdownToText(decodeBytes(bytes)) }
}

export function markdownToText(source: string) {
  let text = source.replace(/\r\n?/g, '\n')
  text = text.replace(/^\uFEFF/, '')
  text = text.replace(/^---\n[\s\S]*?\n---(?:\n|$)/, '')
  text = text.replace(/<!--[\s\S]*?-->/g, '')
  text = text.replace(/^[ \t]*(```|~~~)[^\n]*\n([\s\S]*?)^[ \t]*\1[ \t]*$/gm, '$2')
  text = text.replace(/!\[([^\]]*)\]\([^)\n]*\)/g, '$1')
  text = text.replace(/\[([^\]\n]+)\]\([^)\n]*\)/g, '$1')
  text = text.replace(/\[([^\]\n]+)\]\[[^\]\n]*\]/g, '$1')
  text = text.replace(/^[ \t]*\[[^\]\n]+\]:[^\n]*$/gm, '')
  text = text.replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '')
  text = text.replace(/^[ \t]{0,3}>[ \t]?/gm, '')
  text = text.replace(/^[ \t]*([-*_][ \t]*){3,}$/gm, '')
  text = text.replace(/^[ \t]*[-*+][ \t]+/gm, '')
  text = text.replace(/^[ \t]*\d+[.)][ \t]+/gm, '')
  text = text.replace(/^[ \t]*\|?[ \t:|-]+\|[ \t:|-]*$/gm, '')
  text = text.replace(/^[ \t]*\|(.*)\|[ \t]*$/gm, '$1')
  text = text.replace(/[ \t]*\|[ \t]*/g, ' ')
  text = text.replace(/^[ \t]*(?:=+|-+)[ \t]*$/gm, '')
  text = text.replace(/~~([^~\n]+)~~/g, '$1')
  text = text.replace(/(\*\*|__)(?=\S)([^\n]*?\S)\1/g, '$2')
  text = text.replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?=[^\w*]|$)/g, '$1$2')
  text = text.replace(/(^|[^\w_])_(?=\S)([^_\n]*?\S)_(?=[^\w_]|$)/g, '$1$2')
  text = text.replace(/`([^`\n]*)`/g, '$1')
  text = text.replace(/<\/?[a-z][^>]*>/gi, '')
  text = text.replace(/&nbsp;/g, ' ')
  text = text.replace(/&amp;/g, '&')
  text = text.replace(/&lt;/g, '<')
  text = text.replace(/&gt;/g, '>')
  text = text.replace(/&quot;/g, '"')
  text = text.replace(/&#39;/g, "'")
  return text
}
