export const CONTEXT_MAX = 300

function isEnd(text: string) {
  return /[.!?…]["'»)\]]?$/.test(text.trim())
}

function tidy(text: string) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?…])/g, '$1')
    .trim()
}

export function sentenceAt(tokens: { text: string }[], index: number, limit = CONTEXT_MAX) {
  if (!tokens.length || index < 0 || index >= tokens.length) return ''
  let start = index
  while (start > 0 && !isEnd(tokens[start - 1].text)) start -= 1
  let end = index
  while (end < tokens.length - 1 && !isEnd(tokens[end].text)) end += 1
  const before = tidy(tokens.slice(start, index).map((token) => token.text).join(''))
  const word = tokens[index].text.trim()
  const after = tidy(tokens.slice(index + 1, end + 1).map((token) => token.text).join(''))
  const text = tidy([before, word, after].filter(Boolean).join(' '))
  if (text.length <= limit) return text
  const offset = before ? before.length + 1 : 0
  const room = Math.max(20, Math.floor((limit - word.length) / 2))
  const from = Math.max(0, offset - room)
  const to = Math.min(text.length, from + limit)
  return `${from > 0 ? '…' : ''}${text.slice(from, to).trim()}${to < text.length ? '…' : ''}`
}
