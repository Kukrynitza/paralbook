'use client'

import type { ReactNode } from 'react'
import styles from './ConfirmDialog.module.css'

export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Да',
  cancelLabel = 'Отмена',
  busyLabel = 'Подождите…',
  busy,
  confirmDisabled,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  busyLabel?: string
  busy?: boolean
  confirmDisabled?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  if (!open) return null
  return (
    <div
      className="modal-dim"
      onClick={() => {
        if (!busy) onClose()
      }}
    >
      <div
        className={`modal ${styles.dialog}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <h2>{title}</h2>
        <div className={styles.body}>{children}</div>
        <div className="actions">
          <button className="btn ghost" disabled={busy} onClick={onClose}>
            {cancelLabel}
          </button>
          <button className="btn" disabled={busy || confirmDisabled} onClick={onConfirm}>
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
