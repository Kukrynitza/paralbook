import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import styles from './LlmNotice.module.css'

export default function LlmNotice({ kind }: { kind: 'key' | 'service' }) {
  return (
    <div className={styles.notice} role="status">
      <AlertCircle size={16} className={styles.icon} />
      <div className={styles.body}>
        <p className={styles.text}>
          {kind === 'key'
            ? 'Перевод недоступен: не указан API-ключ. Без перевода текст добавить нельзя.'
            : 'Сервис обработки текста недоступен. Добавить текст пока нельзя — попробуйте позже.'}
        </p>
        {kind === 'key' ? (
          <Link className={styles.link} href="/settings">
            Указать ключ
          </Link>
        ) : null}
      </div>
    </div>
  )
}
