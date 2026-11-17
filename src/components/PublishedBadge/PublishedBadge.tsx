import { Globe } from 'lucide-react'
import styles from './PublishedBadge.module.css'

export default function PublishedBadge({ className }: { className?: string }) {
  return (
    <span
      className={className ? `${styles.badge} ${className}` : styles.badge}
      title="Текст опубликован в общей библиотеке. Удалить его нельзя."
    >
      <Globe size={12} />
      В библиотеке
    </span>
  )
}
