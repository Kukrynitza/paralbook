import styles from './Ring.module.css'

export default function Ring({ value, max, center }: { value: number; max: number; center: string }) {
  const radius = 30
  const length = 2 * Math.PI * radius
  const ratio = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max))
  return (
    <svg className={styles.svg} width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
      <circle cx="36" cy="36" r={radius} fill="none" stroke="var(--border)" strokeWidth="6" />
      <circle
        className={styles.arc}
        cx="36"
        cy="36"
        r={radius}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${length} ${length}`}
        strokeDashoffset={length * (1 - ratio)}
        transform="rotate(-90 36 36)"
        style={{ ['--ring-len' as string]: `${length}px`, ['--ring-to' as string]: `${length * (1 - ratio)}px` }}
      />
      <text x="36" y="40" textAnchor="middle" fill="var(--text)" fontSize="13" fontWeight="700">
        {center}
      </text>
    </svg>
  )
}
