const SEED_KEY = 'paralbook.seedAsked'
const DAILY_KEY = 'paralbook.dailyNew'

export function markSeedAsked(cefr: string) {
  localStorage.setItem(SEED_KEY, cefr)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function readDailyNew() {
  if (typeof window === 'undefined') return 10
  return clamp(Number(localStorage.getItem(DAILY_KEY)) || 10, 5, 60)
}

export function writeDailyNew(value: number) {
  localStorage.setItem(DAILY_KEY, String(clamp(value, 5, 60)))
}
