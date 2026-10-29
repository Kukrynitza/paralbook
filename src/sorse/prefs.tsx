const SEED_KEY = 'paralbook.seedAsked'
const TRAIN_KEY = 'paralbook.training'
const DAILY_KEY = 'paralbook.dailyNew'

export function seedAskedFor(cefr: string) {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(SEED_KEY) === cefr
}

export function markSeedAsked(cefr: string) {
  localStorage.setItem(SEED_KEY, cefr)
}

export type TrainSetup = { fresh: number; total: number }

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function readTraining(): TrainSetup {
  if (typeof window === 'undefined') return { fresh: 10, total: 15 }
  try {
    const raw = JSON.parse(localStorage.getItem(TRAIN_KEY) || '') as Partial<TrainSetup>
    const total = clamp(Number(raw.total) || 15, 5, 50)
    const fresh = clamp(Number(raw.fresh) || 10, 0, Math.min(30, total))
    return { fresh, total }
  } catch {
    return { fresh: 10, total: 15 }
  }
}

export function writeTraining(value: TrainSetup) {
  const total = clamp(value.total, 5, 50)
  const fresh = clamp(value.fresh, 0, Math.min(30, total))
  localStorage.setItem(TRAIN_KEY, JSON.stringify({ fresh, total }))
}

export function readDailyNew() {
  if (typeof window === 'undefined') return 10
  return clamp(Number(localStorage.getItem(DAILY_KEY)) || 10, 5, 60)
}

export function writeDailyNew(value: number) {
  localStorage.setItem(DAILY_KEY, String(clamp(value, 5, 60)))
}
