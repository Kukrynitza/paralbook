'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import listJobs from '@/actions/Jobs/listJobs'
import pollJob from '@/actions/Jobs/pollJob'
import { useAuth, useUi } from '@/contexts/AuthContext'

export type JobStatus = 'uploading' | 'queued' | 'running' | 'done' | 'error'

export interface JobState {
  id: string
  textId: string
  type: 'import' | 'chat'
  title: string
  status: JobStatus
  stage: string | null
  progress: number
  error: string | null
  finishedAt?: number
}

interface JobsValue {
  jobs: JobState[]
  busyJob: JobState | null
  revision: number
  trackJob: (job: { id: string; textId: string; title: string; type: 'import' | 'chat' }) => void
  trackUpload: (job: { textId: string; title: string }) => void
  updateUpload: (textId: string, progress: number, stage?: string) => void
  removeJob: (id: string) => void
  requestNotifications: () => Promise<void>
}

const STORAGE_KEY = 'paralbook.jobs.v1'
const JobsContext = createContext<JobsValue | null>(null)

function statusLabel(stage: string | null) {
  if (stage === 'uploading') return 'Загружаю файл'
  if (stage === 'queued') return 'В очереди'
  if (stage === 'parsing') return 'Разбираю файл'
  if (stage === 'translating') return 'Перевожу'
  if (stage === 'aligning') return 'Выравниваю'
  if (stage === 'saving') return 'Сохраняю'
  if (stage === 'generating') return 'Генерирую'
  return 'Обрабатываю'
}

function readStored(): JobState[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const value = raw ? JSON.parse(raw) : []
    return Array.isArray(value)
      ? value
          .filter((item) => item && item.id && item.status !== 'done' && item.status !== 'error')
          .map((item) => ({ ...item, type: item.type === 'chat' ? 'chat' : 'import' }))
      : []
  } catch {
    return []
  }
}

function showBrowser(title: string, body: string, textId: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  try {
    const notification = new Notification(title, { body, tag: `paralbook-${textId}` })
    notification.onclick = () => {
      window.focus()
      window.location.href = `/read/${textId}`
    }
  } catch {
    // уведомление не критично
  }
}

export function JobProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { notify } = useUi()
  const router = useRouter()
  const [jobs, setJobs] = useState<JobState[]>([])
  const [revision, setRevision] = useState(0)
  const jobsRef = useRef<JobState[]>([])
  const polling = useRef(new Set<string>())
  const finished = useRef(new Set<string>())
  const loaded = useRef(false)

  useEffect(() => {
    jobsRef.current = jobs
  }, [jobs])

  useEffect(() => {
    if (!user) return
    if (!loaded.current) {
      loaded.current = true
      setJobs(readStored())
    }
    let active = true
    listJobs()
      .then((rows) => {
        if (!active) return
        setJobs((current) => {
          const serverTextIds = new Set(rows.map((row) => row.textId).filter(Boolean))
          const localUploads = current.filter((item) => item.id.startsWith('local-') && !serverTextIds.has(item.textId))
          return [
            ...localUploads,
            ...rows
              .filter((row) => row.textId)
              .map((row) => ({
                id: row.id,
                textId: row.textId as string,
                type: row.type,
                title: row.title,
                status: row.status as JobStatus,
                stage: row.stage,
                progress: row.progress,
                error: row.error,
              })),
          ]
        })
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    const timer = window.setInterval(() => {
      for (const job of jobsRef.current) {
        if (job.id.startsWith('local-') || job.status === 'done') continue
        if (job.status === 'error' && job.finishedAt) continue
        if (polling.current.has(job.id)) continue
        polling.current.add(job.id)
        pollJob(job.id)
          .then((next) => {
            const terminal = next.status === 'done' || next.status === 'error'
            setJobs((current) => current.map((item) => (item.id === job.id ? {
              ...item,
              status: next.status as JobStatus,
              stage: next.stage,
              progress: next.progress,
              error: next.error,
              finishedAt: terminal ? Date.now() : item.finishedAt,
            } : item)))
            if ((next.status === 'done' || next.status === 'error') && !finished.current.has(job.id)) {
              finished.current.add(job.id)
              setRevision((value) => value + 1)
              if (next.status === 'done') {
                const title = job.type === 'chat' ? 'Текст готов' : 'Книга готова'
                notify(`${title}: ${job.title}`)
                if (document.visibilityState !== 'visible') showBrowser(title, job.title, job.textId)
              } else {
                const message = next.error || 'Не удалось обработать текст'
                notify(message)
                if (document.visibilityState !== 'visible') showBrowser('Ошибка обработки', message, job.textId)
              }
            }
          })
          .catch((reason) => {
            const message = reason instanceof Error ? reason.message : ''
            if (message.includes('не найдено')) {
              finished.current.add(job.id)
              setJobs((current) => current.filter((item) => item.id !== job.id))
            }
          })
          .finally(() => polling.current.delete(job.id))
      }
    }, 1600)
    return () => window.clearInterval(timer)
  }, [notify, user])

  useEffect(() => {
    if (!user) return
    const timer = window.setInterval(() => {
      setJobs((current) => current.filter((job) => {
        if (job.status !== 'done' && job.status !== 'error') return true
        if (!job.finishedAt) return true
        return Date.now() - job.finishedAt < 9000
      }))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [user])

  useEffect(() => {
    if (!user) return
    try {
      const active = jobs.filter((job) => !job.id.startsWith('local-') && job.status !== 'done' && job.status !== 'error')
      localStorage.setItem(STORAGE_KEY, JSON.stringify(active))
    } catch {
      // localStorage может быть недоступен
    }
  }, [jobs, user])

  async function requestNotifications() {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission === 'default') {
      await Notification.requestPermission()
    }
  }

  const value = useMemo<JobsValue>(
    () => ({
      jobs,
      busyJob: jobs.find((job) => job.status === 'uploading' || job.status === 'queued' || job.status === 'running') ?? null,
      revision,
      trackJob: ({ id, textId, title, type }) => {
        setJobs((current) => {
          const withoutLocal = current.filter((item) => item.textId !== textId)
          if (withoutLocal.some((item) => item.id === id)) return withoutLocal
          return [...withoutLocal, { id, textId, type, title, status: 'queued', stage: 'queued', progress: 0, error: null }]
        })
      },
      trackUpload: ({ textId, title }) => {
        setJobs((current) => {
          if (current.some((item) => item.textId === textId)) return current
          return [...current, { id: `local-${textId}`, textId, type: 'import', title, status: 'uploading', stage: 'uploading', progress: 0, error: null }]
        })
      },
      updateUpload: (textId, progress, stage = 'uploading') => {
        setJobs((current) => current.map((item) => (
          item.textId === textId ? { ...item, progress: Math.round(progress), stage } : item
        )))
      },
      removeJob: (id) => setJobs((current) => current.filter((item) => item.id !== id)),
      requestNotifications,
    }),
    [jobs, revision],
  )

  // revision используется страницами, которые должны перезагрузить данные после завершения job.
  useEffect(() => {
    if (revision) router.refresh()
  }, [revision, router])

  return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>
}

export function useJobs() {
  const value = useContext(JobsContext)
  if (!value) throw new Error('JobProvider')
  return value
}

export { statusLabel }
