export function niceMax(value: number): number {
  const safe = Math.max(1, Math.ceil(Number.isFinite(value) ? value : 1))
  if (safe <= 5) return 5
  const power = 10 ** Math.floor(Math.log10(safe))
  const fraction = safe / power
  const rounded = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return rounded * power
}
