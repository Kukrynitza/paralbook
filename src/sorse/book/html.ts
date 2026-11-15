// Используется только для разбора XHTML-глав внутри EPUB.
// HTML как формат загрузки не поддерживается.

const BLOCKS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'caption',
  'dd',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'li',
  'main',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
])

const SKIP = new Set(['script', 'style', 'noscript', 'svg', 'math', 'iframe', 'object', 'canvas', 'template', 'nav'])

function walk(node: Node, parts: string[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    parts.push(node.nodeValue ?? '')
    return
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return
  const element = node as Element
  const tag = element.tagName.toLowerCase()
  if (SKIP.has(tag)) return
  if (tag === 'br') {
    parts.push('\n')
    return
  }
  for (const child of Array.from(element.childNodes)) walk(child, parts)
  if (BLOCKS.has(tag)) parts.push('\n\n')
}

export function htmlToText(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const title = doc.querySelector('head title')?.textContent?.trim() ?? ''
  for (const node of Array.from(doc.querySelectorAll('script,style,noscript,svg,math,iframe,object,canvas,template,nav'))) {
    node.remove()
  }
  const body = doc.body
  if (!body) return { title, text: '' }
  const parts: string[] = []
  walk(body, parts)
  return { title, text: parts.join('') }
}
