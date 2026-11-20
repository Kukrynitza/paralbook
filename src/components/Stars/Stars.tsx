import { Star } from 'lucide-react'
import { ratingSummary } from '@/sorse/rating'
import styles from './Stars.module.css'

export default function Stars({
  average,
  mine,
  count,
  onPick,
}: {
  average: number | null
  mine: number | null
  count?: number
  onPick?: (value: number) => void
}) {
  const fill = mine ?? 0
  const label = count == null
    ? average == null ? null : average.toFixed(1)
    : ratingSummary(average, count)
  return (
    <span className={styles.row}>
      {[1, 2, 3, 4, 5].map((value) => (
        <button
          key={value}
          type="button"
          className={value <= fill ? `${styles.star} ${styles.on}` : styles.star}
          aria-label={String(value)}
          data-tip={`Оценка ${value} из 5`}
          onClick={() => onPick?.(value)}
        >
          <Star size={16} fill={value <= fill ? 'currentColor' : 'none'} />
        </button>
      ))}
      {label == null ? null : <span className={styles.avg}>{label}</span>}
    </span>
  )
}
