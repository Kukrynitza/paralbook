'use client'

import { useRouter } from 'next/navigation'
import { statusLabel, useJobs } from '@/contexts/JobContext'

export default function BusyNotice({ title }: { title: string }) {
  const { busyJob } = useJobs()
  const router = useRouter()
  if (!busyJob) return null
  return (
    <div>
      <header className="header">
        <h1>{title}</h1>
      </header>
      <div className="pad stack">
        <div className="card stack">
          <strong>Сейчас выполняется: {busyJob.title}</strong>
          <div className="bar">
            <i style={{ width: `${Math.max(2, busyJob.progress)}%` }} />
          </div>
          <div className="row small muted">
            <span>{statusLabel(busyJob.stage)}</span>
            <span>{busyJob.progress}%</span>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Дождитесь завершения текущей задачи — новые книги и запросы будут доступны после неё.
          </p>
          <button type="button" className="btn ghost slim" onClick={() => router.push('/')}>
            Вернуться в подборку
          </button>
        </div>
      </div>
    </div>
  )
}
