import styles from './Pager.module.css'

export default function Pager({
  page,
  pages,
  onPage,
  className,
  prevDisabled,
  nextDisabled,
}: {
  page: number
  pages: number
  onPage: (page: number) => void
  className?: string
  prevDisabled?: boolean
  nextDisabled?: boolean
}) {
  const windowStart = Math.max(1, Math.min(page - 1, pages - 2))
  const labels = pages <= 3 ? Array.from({ length: pages }, (_, index) => index + 1) : [windowStart, windowStart + 1, windowStart + 2].filter((item) => item <= pages)
  const backOff = prevDisabled ?? page <= 1
  const forwardOff = nextDisabled ?? page >= pages
  return (
    <div className={className ? `${styles.pager} ${className}` : styles.pager}>
      <button type="button" disabled={backOff} onClick={() => onPage(page - 1)} aria-label="Назад">
        ←
      </button>
      {labels.map((item) => (
        <button key={item} type="button" className={item === page ? styles.on : ''} onClick={() => onPage(item)}>
          {item}
        </button>
      ))}
      <button type="button" disabled={forwardOff} onClick={() => onPage(page + 1)} aria-label="Дальше">
        →
      </button>
    </div>
  )
}
