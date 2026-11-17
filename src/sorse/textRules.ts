export function isTwoBooks(fileName: string) {
  return /\.2books$/i.test(fileName)
}

export function needsTranslation(english: string, russian: string) {
  const en = english.trim()
  const ru = russian.trim()
  if (!en && !ru) return false
  return !(en && ru)
}

export function canAddWithoutKey({
  english = '',
  russian = '',
  fileName,
}: {
  english?: string
  russian?: string
  fileName?: string
}) {
  if (fileName !== undefined) return isTwoBooks(fileName)
  return Boolean(english.trim() && russian.trim())
}
