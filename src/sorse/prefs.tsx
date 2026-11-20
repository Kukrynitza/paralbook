const SEED_KEY = 'paralbook.seedAsked'
const DAILY_KEY = 'paralbook.dailyNew'

function storageKey(base: string, owner?: string) {
  return `${base}:${owner || 'anonymous'}`
}

export function markSeedAsked(cefr: string, owner?: string) {
  localStorage.setItem(storageKey(SEED_KEY, owner), cefr)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function readDailyNew(owner?: string) {
  if (typeof window === 'undefined') return 10
  return clamp(Number(localStorage.getItem(storageKey(DAILY_KEY, owner))) || 10, 5, 60)
}

export function writeDailyNew(value: number, owner?: string) {
  localStorage.setItem(storageKey(DAILY_KEY, owner), String(clamp(value, 5, 60)))
}
