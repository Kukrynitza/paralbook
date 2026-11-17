import Link from 'next/link'
import { AlertCircle, X } from 'lucide-react'
import type { AlertItem } from '@/sorse/types'
import styles from './Alerts.module.css'

export default function Alerts({ items, onClose }: { items: AlertItem[]; onClose: (id: string) => void }) {
  if (!items.length) return null
  return (
    <div className={styles.stack}>
      {items.map((item) => (
        <div className={styles.alert} key={item.id} role="alert">
          <AlertCircle size={16} className={styles.icon} />
          <div className={styles.body}>
            <p className={styles.text}>{item.message}</p>
            {item.href && item.linkLabel ? (
              <Link className={styles.link} href={item.href} onClick={() => onClose(item.id)}>
                {item.linkLabel}
              </Link>
            ) : null}
          </div>
          <button type="button" className={styles.close} aria-label="Закрыть" onClick={() => onClose(item.id)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
