export function splitByShare<T>(items: T[], weights: number[]) {
  const total = weights.reduce((sum, value) => sum + value, 0)
  if (!total) return weights.map(() => [] as T[])
  let used = 0
  return weights.map((weight, index) => {
    const start = Math.round((items.length * used) / total)
    used += weight
    const end = index === weights.length - 1 ? items.length : Math.round((items.length * used) / total)
    return items.slice(start, end)
  })
}
