import { Star } from 'lucide-react'
import styles from './Stars.module.css'

export default function Stars({
  average,
  mine,
  onPick,
}: {
  average: number | null
  mine: number | null
  onPick?: (value: number) => void
}) {
  const fill = mine ?? 0
  return (
    <span className={styles.row}>
      {[1, 2, 3, 4, 5].map((value) => (
        <button
          key={value}
          type="button"
          className={value <= fill ? `${styles.star} ${styles.on}` : styles.star}
          aria-label={String(value)}
          onClick={() => onPick?.(value)}
        >
          <Star size={16} fill={value <= fill ? 'currentColor' : 'none'} />
        </button>
      ))}
      {average == null ? null : <span className={styles.avg}>{average.toFixed(1)}</span>}
    </span>
  )
}
