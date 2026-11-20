const KEY = 'paralbook.studyDay.v3'

function storageKey(owner?: string) {
  return `${KEY}:${owner || 'anonymous'}`
}

export interface DayState {
  day: string
  extra: number
  targets: string[]
  completed: string[]
  reviewed: string[]
  introduced: string[]
}

function localDay(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function amount(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.min(600, Math.trunc(number))) : 0
}

function terms(value: unknown) {
  if (!Array.isArray(value)) return []
  return [...new Set(
    value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  )].slice(0, 600)
}

export function emptyDay(day = localDay()): DayState {
  return { day, extra: 0, targets: [], completed: [], reviewed: [], introduced: [] }
}

export function parseDayState(raw: string | null, day = localDay()): DayState {
  if (!raw) return emptyDay(day)
  try {
    const value = JSON.parse(raw) as Partial<DayState>
    if (value.day !== day) return emptyDay(day)
    return {
      day,
      extra: amount(value.extra),
      targets: terms(value.targets),
      completed: terms(value.completed),
      reviewed: terms(value.reviewed),
      introduced: terms(value.introduced),
    }
  } catch {
    return emptyDay(day)
  }
}

function read(owner?: string) {
  return parseDayState(typeof window === 'undefined' ? null : window.localStorage.getItem(storageKey(owner)))
}

function write(state: DayState, owner?: string) {
  try {
    window.localStorage.setItem(storageKey(owner), JSON.stringify(state))
  } catch {
    // localStorage может быть недоступен
  }
}

export function readDayState(owner?: string) {
  return read(owner)
}

export function markTarget(lemma: string, owner?: string) {
  const state = read(owner)
  const word = lemma.trim().toLowerCase()
  if (!word) return state
  const next = {
    ...state,
    targets: state.targets.includes(word) ? state.targets : [...state.targets, word].slice(0, 600),
    introduced: state.introduced.includes(word) ? state.introduced : [...state.introduced, word].slice(0, 600),
  }
  write(next, owner)
  return next
}

export function markCompleted(lemma: string, owner?: string) {
  const state = read(owner)
  const word = lemma.trim().toLowerCase()
  if (!word) return state
  const next = {
    ...state,
    completed: state.completed.includes(word) ? state.completed : [...state.completed, word].slice(0, 600),
    introduced: state.introduced.includes(word) ? state.introduced : [...state.introduced, word].slice(0, 600),
  }
  write(next, owner)
  return next
}

export function markReviewed(lemma: string, owner?: string) {
  const state = read(owner)
  const word = lemma.trim().toLowerCase()
  if (!word) return state
  const next = {
    ...state,
    reviewed: state.reviewed.includes(word) ? state.reviewed : [...state.reviewed, word].slice(0, 600),
  }
  write(next, owner)
  return next
}

export function markAdded(lemma: string, owner?: string) {
  const state = read(owner)
  const word = lemma.trim().toLowerCase()
  if (!word) return state
  const next = {
    ...state,
    introduced: state.introduced.includes(word) ? state.introduced : [...state.introduced, word].slice(0, 600),
  }
  write(next, owner)
  return next
}

export function addExtra(count: number, owner?: string) {
  const state = read(owner)
  const next = { ...state, extra: amount(state.extra + Math.max(1, Math.trunc(count))) }
  write(next, owner)
  return next
}

export function dailyUsed(state: DayState) {
  return state.introduced.length
}

export function studiedCount(state: DayState) {
  return new Set([...state.targets, ...state.completed]).size
}

export function remainingNew(limit: number, state: DayState) {
  return Math.max(0, Math.max(0, Math.trunc(limit)) + state.extra - studiedCount(state))
}
