export interface ReviewStep {
  minutes: number
  label: string
  short: string
}

// Расписание как в ReWord: 30 минут, 2 часа, 1 день, 7 дней и финальная
// проверка через 60 дней. После успешной финальной проверки слово освоено.
export const REVIEW_STEPS: ReviewStep[] = [
  { minutes: 30, label: '30 минут', short: '30 мин' },
  { minutes: 120, label: '2 часа', short: '2 ч' },
  { minutes: 1440, label: '1 день', short: '1 д' },
  { minutes: 10080, label: '7 дней', short: '7 д' },
  { minutes: 86400, label: '60 дней', short: '60 д' },
]

export const MASTER_STEP = REVIEW_STEPS.length

export interface ReviewState {
  correct: number
  wrong: number
  intervalDays: number
  mastered: boolean
}

export interface StoredReviewState {
  correct: number
  wrong: number
  intervalDays: number
  mastered: boolean
}

function count(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0
}

function stepOf(value: unknown) {
  return Math.min(MASTER_STEP, count(value))
}

export function nextReview(row: StoredReviewState | undefined, remembered: boolean): ReviewState | null {
  if (row?.mastered) return null
  let correct = count(row?.correct)
  let wrong = count(row?.wrong)
  let intervalDays = stepOf(row?.intervalDays)
  let mastered = false
  if (remembered) {
    correct += 1
    if (intervalDays >= MASTER_STEP) {
      intervalDays = MASTER_STEP
      mastered = true
    } else {
      intervalDays += 1
    }
  } else {
    wrong += 1
    if (intervalDays > 0) intervalDays = Math.max(1, intervalDays - 1)
  }
  return { correct, wrong, intervalDays, mastered }
}

export function reviewMinutes(step: number): number | null {
  const value = stepOf(step)
  if (value < 1) return null
  return REVIEW_STEPS[value - 1]?.minutes ?? null
}

export function intervalLabel(step: number): string {
  const value = stepOf(step)
  if (value < 1) return 'сейчас'
  return REVIEW_STEPS[value - 1]?.label ?? 'сейчас'
}

export function nextReviewText(dueAt: string | Date | null): string {
  if (!dueAt) return 'Повторение не запланировано'
  const due = new Date(dueAt).getTime()
  if (!Number.isFinite(due)) return 'Повторение не запланировано'
  const seconds = Math.round((due - Date.now()) / 1000)
  if (seconds <= 0) return 'Пора повторить'
  const minutes = Math.ceil(seconds / 60)
  if (minutes < 60) return `Следующее повторение через ${minutes} мин.`
  const hours = Math.ceil(minutes / 60)
  if (hours < 24) return `Следующее повторение через ${hours} ч.`
  const days = Math.ceil(hours / 24)
  return `Следующее повторение через ${days} дн.`
}
