const boundary = /[.!?]/

export function bare(part: string) {
  return part.replace(/^[^A-Za-zА-Яа-яЁё]+|[^A-Za-zА-Яа-яЁё]+$/g, '').toLowerCase()
}

export function sentenceAt(tokens: string[], index: number) {
  let start = index
  let end = index
  while (start > 0 && !boundary.test(tokens[start - 1] ?? '')) start -= 1
  while (end < tokens.length - 1 && !boundary.test(tokens[end] ?? '')) end += 1
  return tokens.slice(start, end + 1).join('')
}
