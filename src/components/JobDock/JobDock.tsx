'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle2, LoaderCircle, X } from 'lucide-react'
import retryImport from '@/actions/Jobs/retryImport'
import dismissJob from '@/actions/Jobs/dismissJob'
import CancelButton from '@/components/CancelButton/CancelButton'
import { statusLabel, useJobs, type JobState } from '@/contexts/JobContext'
import { useUi } from '@/contexts/AuthContext'
import styles from './JobDock.module.css'

function RetryButton({ job }: { job: JobState }) {
  const { trackJob, removeJob } = useJobs()
  const { notify } = useUi()
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function retry() {
    setBusy(true)
    try {
      const result = await retryImport(job.id)
      removeJob(job.id)
      if ('upload' in result && result.upload) {
        notify('Выберите файл снова')
        router.push('/text')
        return
      }
      trackJob({ id: result.jobId, textId: result.textId, title: result.title, type: 'import' })
      notify('Импорт повторён')
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Не удалось повторить импорт')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button type="button" className={styles.link} disabled={busy} onClick={() => void retry()}>
      {busy ? 'Повторяю…' : 'Повторить'}
    </button>
  )
}

export default function JobDock({ aboveNav = false }: { aboveNav?: boolean }) {
  const { jobs, removeJob } = useJobs()
  if (!jobs.length) return null

  return (
    <div className={aboveNav ? `${styles.dock} ${styles.aboveNav}` : styles.dock}>
      {jobs.map((job) => {
        const done = job.status === 'done'
        const failed = job.status === 'error'
        const cancelled = job.status === 'cancelled'
        return (
          <div className={`${styles.card} ${failed ? styles.failed : ''} ${cancelled ? styles.cancelled : ''}`} key={job.id}>
            <div className={styles.top}>
              {done ? (
                <CheckCircle2 size={16} />
              ) : failed || cancelled ? (
                <AlertCircle size={16} />
              ) : (
                <LoaderCircle size={16} className={styles.spin} />
              )}
              <span className={styles.title}>{job.title}</span>
              <button
                type="button"
                className={styles.close}
                onClick={async () => {
                  if (failed && job.type === 'import') {
                    try {
                      await dismissJob(job.id)
                    } catch {
                      // задачу могли уже убрать
                    }
                  }
                  removeJob(job.id)
                }}
                aria-label="Скрыть"
              >
                <X size={14} />
              </button>
            </div>
            {failed ? (
              <>
                <p className={styles.error}>{job.error || 'Не удалось обработать текст'}</p>
                {job.type === 'import' ? <RetryButton job={job} /> : null}
              </>
            ) : cancelled ? (
              <p className={styles.note}>Задание отменено</p>
            ) : done ? (
              <Link className={styles.link} href={`/read/${job.textId}`}>
                {job.type === 'chat' ? 'Открыть текст' : 'Открыть книгу'}
              </Link>
            ) : (
              <>
                <div className={styles.bar}><i style={{ width: `${Math.max(2, job.progress)}%` }} /></div>
                <div className={styles.bottom}>
                  <span>{statusLabel(job.stage)}</span>
                  <span>{job.progress}%</span>
                </div>
                <CancelButton job={job} className={styles.cancel} />
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
