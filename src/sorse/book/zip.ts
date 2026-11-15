import { unzipSync, type Unzipped } from 'fflate'

const MAX_ENTRY_BYTES = 20 * 1024 * 1024
const MAX_TOTAL_BYTES = 60 * 1024 * 1024

class ArchiveLimitError extends Error {}

export function unzipSelected(bytes: Uint8Array, keep: (name: string) => boolean): Unzipped {
  let total = 0
  try {
    return unzipSync(bytes, {
      filter(file) {
        if (!keep(file.name)) return false
        if (file.originalSize > MAX_ENTRY_BYTES) {
          throw new ArchiveLimitError(`Файл «${file.name}» внутри архива слишком большой`)
        }
        total += file.originalSize
        if (total > MAX_TOTAL_BYTES) throw new ArchiveLimitError('Архив слишком большой после распаковки')
        return true
      },
    })
  } catch (reason) {
    if (reason instanceof ArchiveLimitError) throw reason
    throw new Error('Не удалось распаковать архив: файл повреждён')
  }
}

export function entryMap(files: Unzipped) {
  const map = new Map<string, Uint8Array>()
  for (const [name, data] of Object.entries(files)) {
    map.set(name, data)
    map.set(name.toLowerCase(), data)
  }
  return map
}

export function getEntry(files: Map<string, Uint8Array>, path: string) {
  const clean = path.replace(/\\/g, '/').replace(/^\/+/, '').split('#')[0].split('?')[0]
  let decoded = clean
  try {
    decoded = decodeURIComponent(clean)
  } catch {
    // путь не закодирован — оставляем как есть
  }
  return files.get(decoded) ?? files.get(decoded.toLowerCase()) ?? null
}

export function resolvePath(baseDir: string, href: string) {
  const clean = href.replace(/\\/g, '/').split('#')[0].split('?')[0]
  let decoded = clean
  try {
    decoded = decodeURIComponent(clean)
  } catch {
    // путь не закодирован — оставляем как есть
  }
  const parts = `${baseDir ? `${baseDir}/` : ''}${decoded}`.split('/')
  const result: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') {
      result.pop()
      continue
    }
    result.push(part)
  }
  return result.join('/')
}

export function directoryOf(path: string) {
  const index = path.lastIndexOf('/')
  return index < 0 ? '' : path.slice(0, index)
}
