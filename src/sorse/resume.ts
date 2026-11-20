const KEY = 'paralbook.resume.v1'
const MAX_AGE = 30 * 24 * 60 * 60 * 1000

export interface ResumeEntry {
  id: string
  title: string
  page: number
  pageCount: number
  progress: number
  updatedAt: number
}

function storageKey(owner?: string) {
  return `${KEY}:${owner || 'anonymous'}`
}

export function saveResume(entry: ResumeEntry, owner?: string) {
  try {
    window.localStorage.setItem(storageKey(owner), JSON.stringify(entry))
  } catch {
    // localStorage может быть недоступен
  }
}

export function readResume(owner?: string): ResumeEntry | null {
  try {
    const raw = window.localStorage.getItem(storageKey(owner))
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<ResumeEntry>
    if (
      typeof value.id !== 'string' ||
      typeof value.title !== 'string' ||
      typeof value.page !== 'number' ||
      typeof value.pageCount !== 'number' ||
      typeof value.progress !== 'number' ||
      typeof value.updatedAt !== 'number'
    ) {
      return null
    }
    if (Date.now() - value.updatedAt > MAX_AGE) {
      window.localStorage.removeItem(storageKey(owner))
      return null
    }
    return value as ResumeEntry
  } catch {
    return null
  }
}

export function clearResume(owner?: string) {
  try {
    window.localStorage.removeItem(storageKey(owner))
  } catch {
    // localStorage может быть недоступен
  }
}
