export function ratingsWord(count: number): string {
  const value = Math.abs(Math.trunc(count))
  const mod10 = value % 10
  const mod100 = value % 100
  if (mod10 === 1 && mod100 !== 11) return 'оценка'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'оценки'
  return 'оценок'
}

export function ratingSummary(average: number | null, count: number): string {
  if (!count || average == null) return 'Нет оценок'
  return `${average.toFixed(1)} · ${count} ${ratingsWord(count)}`
}
