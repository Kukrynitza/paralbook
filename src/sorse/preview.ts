export function preview(text: string, limit = 180) {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  const sentence = clean.match(/^[\s\S]*?[.!?…]["»']?/)
  if (sentence && sentence[0].trim().length <= limit && sentence[0].trim().length < clean.length) {
    return sentence[0].trim()
  }
  if (clean.length <= limit && /[.!?…]["»']?$/.test(clean)) return clean
  const slice = clean.slice(0, Math.min(clean.length, limit + 1))
  const cut = slice.lastIndexOf(' ')
  const word = (cut > 0 ? slice.slice(0, cut) : slice.slice(0, limit)).trim()
  return word.endsWith('…') ? word : `${word}…`
}
