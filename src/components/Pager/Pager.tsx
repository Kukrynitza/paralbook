'use client'

import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import styles from './Pager.module.css'

const WINDOW = 5

function pageWindow(page: number, pages: number) {
  if (pages <= WINDOW) return Array.from({ length: pages }, (_, index) => index + 1)
  const start = Math.max(1, Math.min(page - Math.floor(WINDOW / 2), pages - WINDOW + 1))
  return Array.from({ length: WINDOW }, (_, index) => start + index)
}

export default function Pager({
  page,
  pages,
  onPage,
  className,
  prevDisabled,
  nextDisabled,
  jump,
  finishLabel,
}: {
  page: number
  pages: number
  onPage: (page: number) => void
  className?: string
  prevDisabled?: boolean
  nextDisabled?: boolean
  jump?: boolean
  finishLabel?: string
}) {
  const labels = pageWindow(page, pages)
  const backOff = prevDisabled ?? page <= 1
  const forwardOff = nextDisabled ?? page >= pages
  const [draft, setDraft] = useState(String(page))

  useEffect(() => {
    setDraft(String(page))
  }, [page])

  function commit() {
    const value = Number(draft.replace(/\D/g, ''))
    if (!Number.isFinite(value) || value < 1) {
      setDraft(String(page))
      return
    }
    const next = Math.min(pages, Math.max(1, Math.trunc(value)))
    setDraft(String(next))
    if (next !== page) onPage(next)
  }

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
      {page >= pages && finishLabel ? (
        <button
          type="button"
          className={styles.finish}
          disabled={nextDisabled}
          onClick={() => onPage(page + 1)}
        >
          <Check size={15} />
          {finishLabel}
        </button>
      ) : (
        <button type="button" disabled={forwardOff} onClick={() => onPage(page + 1)} aria-label="Дальше">
          →
        </button>
      )}
      {jump && pages > 1 ? (
        <form
          className={styles.jump}
          onSubmit={(event) => {
            event.preventDefault()
            commit()
          }}
        >
          <input
            className={styles.input}
            inputMode="numeric"
            aria-label="Номер страницы"
            data-tip="Введите номер страницы"
            value={draft}
            disabled={backOff && forwardOff}
            onChange={(event) => setDraft(event.target.value.replace(/\D/g, '').slice(0, String(pages).length))}
            onBlur={commit}
          />
          <span>из {pages}</span>
        </form>
      ) : null}
    </div>
  )
}
