'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import cancelImport from '@/actions/Reading/cancelImport'
import startImport from '@/actions/Reading/startImport'
import { LEVELS, type Cefr } from '@/sorse/types'
import { useAuth, useUi } from '@/contexts/AuthContext'
import { useJobs } from '@/contexts/JobContext'
import BusyNotice from '@/components/BusyNotice/BusyNotice'

const ACCEPT = '.txt,.text,.md,.markdown,.fb2,.epub,.docx,.2books'

const LANGUAGES = [
  ['auto', 'Определить автоматически'],
  ['en', 'Английский'],
  ['ru', 'Русский'],
] as const

type Language = (typeof LANGUAGES)[number][0]

interface ImportLimits {
  maxUploadBytes: number
  maxUploadText: number
  maxTranslateChars: number
}

interface StartedJob {
  id: string
  status: string
  textId: string | null
}

function detailFrom(value: unknown, fallback: string) {
  if (value && typeof value === 'object' && 'detail' in value) return String((value as { detail: unknown }).detail)
  return fallback
}

function uploadFile(url: string, token: string, file: File, language: Language, onProgress: (value: number) => void) {
  return new Promise<StartedJob>((resolve, reject) => {
    const data = new FormData()
    data.append('file', file)
    data.append('translate', 'true')
    data.append('source', 'upload')
    data.append('language', language)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
    }
    xhr.onerror = () => reject(new Error('Не удалось отправить файл'))
    xhr.onload = () => {
      let value: unknown = null
      try {
        value = JSON.parse(xhr.responseText)
      } catch {
        value = null
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(value as StartedJob)
      else reject(new Error(detailFrom(value, 'Не удалось начать обработку')))
    }
    xhr.send(data)
  })
}

export default function Page() {
  const { user } = useAuth()
  const { notify } = useUi()
  const { trackJob, trackUpload, updateUpload, removeJob, requestNotifications, busyJob } = useJobs()
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [topic, setTopic] = useState('')
  const [level, setLevel] = useState<Cefr>(user?.cefr ?? 'B1')
  const [language, setLanguage] = useState<Language>('auto')
  const [file, setFile] = useState<File | null>(null)
  const [pending, setPending] = useState(false)
  const [limits, setLimits] = useState<ImportLimits | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!file) {
      notify('Выберите файл книги')
      return
    }
    setPending(true)
    let textId: string | null = null
    const bookTitle = title.trim() || file.name.replace(/\.[^.]+$/, '') || 'Книга'
    try {
      void requestNotifications()
      const start = await startImport({ title: bookTitle, topic, level })
      textId = start.textId
      setLimits(start.limits)
      trackUpload({ textId: start.textId, title: bookTitle })
      const job = await uploadFile(`${start.serviceUrl}/v1/jobs/import/file`, start.token, file, language, (progress) => {
        updateUpload(start.textId, progress, 'uploading')
      })
      trackJob({ id: job.id, textId: start.textId, title: bookTitle, type: 'import' })
      notify('Файл загружен. Обработка продолжится в фоне')
      router.push('/')
    } catch (reason) {
      if (textId) {
        removeJob(`local-${textId}`)
        await cancelImport(textId)
      }
      notify(reason instanceof Error ? reason.message : 'Не удалось загрузить текст')
      setPending(false)
    }
  }

  if (busyJob) return <BusyNotice title="Загрузка" />

  const busy = pending
  const maxMb = limits ? Math.round(limits.maxUploadBytes / 1024 / 1024) : null
  const translateK = limits ? Math.round(limits.maxTranslateChars / 1000) : null

  return (
    <div>
      <header className="header">
        <h1>Загрузка</h1>
      </header>
      <form className="pad stack" onSubmit={(event) => void submit(event)}>
        <label className="field">
          <span>Название</span>
          <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="field">
          <span>Тема</span>
          <input className="input" value={topic} placeholder="Если пусто, берётся название" onChange={(event) => setTopic(event.target.value)} />
        </label>
        <label className="field">
          <span>Уровень</span>
          <select className="input" value={level} onChange={(event) => setLevel(event.target.value as Cefr)}>
            {LEVELS.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Язык книги</span>
          <select className="input" value={language} onChange={(event) => setLanguage(event.target.value as Language)}>
            {LANGUAGES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <span className="muted">
            {language === 'ru' ? 'Русская книга будет переведена на английский' : 'Если книга на русском, она будет переведена на английский автоматически'}
          </span>
        </label>
        <label className="field">
          <span>Файл книги</span>
          <input
            type="file"
            accept={ACCEPT}
            disabled={busy}
            onChange={(event) => {
              const next = event.target.files?.[0] ?? null
              setFile(next)
              if (next && !title) setTitle(next.name.replace(/\.[^.]+$/, ''))
            }}
          />
          <span className="muted">
            {file
              ? file.name
              : maxMb
                ? `TXT, FB2, EPUB, DOCX, Markdown, .2books — до ${maxMb} МБ`
                : 'TXT, FB2, EPUB, DOCX, Markdown, .2books'}
            {translateK ? ` · автоперевод до ${translateK} тыс. символов` : ''}
          </span>
        </label>
        <p className="small muted" style={{ margin: 0 }}>
          Большие книги обрабатываются в фоне. После загрузки файла можно уйти — прогресс будет в правом нижнем углу.
        </p>
        <button className="btn" disabled={busy} type="submit">
          {pending ? 'Загружаю…' : 'Загрузить книгу'}
        </button>
        <Link className="btn ghost slim" href="/text">
          Добавить текст вручную
        </Link>
      </form>
    </div>
  )
}
