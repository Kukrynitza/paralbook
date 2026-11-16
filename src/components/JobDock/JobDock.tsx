'use client'

import Link from 'next/link'
import { AlertCircle, CheckCircle2, LoaderCircle, X } from 'lucide-react'
import { statusLabel, useJobs } from '@/contexts/JobContext'
import styles from './JobDock.module.css'

export default function JobDock({ aboveNav = false }: { aboveNav?: boolean }) {
  const { jobs, removeJob } = useJobs()
  if (!jobs.length) return null

  return (
    <div className={aboveNav ? `${styles.dock} ${styles.aboveNav}` : styles.dock}>
      {jobs.map((job) => {
        const done = job.status === 'done'
        const failed = job.status === 'error'
        return (
          <div className={`${styles.card} ${failed ? styles.failed : ''}`} key={job.id}>
            <div className={styles.top}>
              {done ? <CheckCircle2 size={16} /> : failed ? <AlertCircle size={16} /> : <LoaderCircle size={16} className={styles.spin} />}
              <span className={styles.title}>{job.title}</span>
              <button type="button" className={styles.close} onClick={() => removeJob(job.id)} aria-label="Скрыть">
                <X size={14} />
              </button>
            </div>
            {failed ? (
              <p className={styles.error}>{job.error || 'Не удалось обработать текст'}</p>
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
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
