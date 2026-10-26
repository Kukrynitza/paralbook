export const HINT_MAX = 80

export function shortHint(value: string) {
  return value.trim().slice(0, HINT_MAX)
}
