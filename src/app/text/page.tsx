'use client'

import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import cancelImport from '@/actions/Reading/cancelImport'
import startImport from '@/actions/Reading/startImport'
import { LEVELS, type Cefr, type LlmSettingsView } from '@/sorse/types'
import { readLlmSettings } from '@/sorse/llmClient'
import { canAddWithoutKey } from '@/sorse/textRules'
import { readChunkPrefs } from '@/sorse/translationPrefs'
import { useAuth, useUi } from '@/contexts/AuthContext'
import { useJobs } from '@/contexts/JobContext'
import BusyNotice from '@/components/BusyNotice/BusyNotice'
import LlmNotice from '@/components/LlmNotice/LlmNotice'
import styles from './page.module.css'

const LIMIT = 200_000
const ACCEPT = '.txt,.text,.md,.markdown,.fb2,.epub,.docx,.2books'

interface StartedJob {
  id: string
  status: string
  textId: string | null
}

function detailFrom(value: unknown, fallback: string) {
  if (value && typeof value === 'object' && 'detail' in value) return String((value as { detail: unknown }).detail)
  return fallback
}

function counter(value: string) {
  return `${value.length.toLocaleString('ru-RU')} / ${LIMIT.toLocaleString('ru-RU')}`
}

function grow(event: ChangeEvent<HTMLTextAreaElement>) {
  const element = event.currentTarget
  const base = 168
  const max = base * 2
  element.style.height = 'auto'
  element.style.height = `${Math.min(Math.max(element.scrollHeight, base), max)}px`
  element.style.overflowY = element.scrollHeight > max ? 'auto' : 'hidden'
}

function uploadFile(
  url: string,
  token: string,
  file: File,
  onProgress: (value: number) => void,
) {
  return new Promise<StartedJob>((resolve, reject) => {
    const data = new FormData()
    data.append('file', file)
    data.append('translate', 'true')
    data.append('source', 'upload')
    data.append('language', 'auto')
    const chunk = readChunkPrefs()
    data.append('chunkUnit', chunk.unit)
    data.append('chunkSize', String(chunk.size))
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.timeout = 20 * 60 * 1000
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
    }
    xhr.onerror = () => reject(new Error('Не удалось отправить файл'))
    xhr.ontimeout = () => reject(new Error('Загрузка файла заняла слишком много времени'))
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
  const { notify, notifyError, hasAlerts } = useUi()
  const { busyJob, trackJob, trackUpload, updateUpload, removeJob, requestNotifications } = useJobs()
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [topic, setTopic] = useState('')
  const [level, setLevel] = useState<Cefr>(user?.cefr ?? 'B1')
  const [file, setFile] = useState<File | null>(null)
  const [manual, setManual] = useState(false)
  const [english, setEnglish] = useState('')
  const [russian, setRussian] = useState('')
  const [pending, setPending] = useState(false)
  const [llm, setLlm] = useState<LlmSettingsView | null | undefined>(undefined)
  const [llmRetrying, setLlmRetrying] = useState(false)

  useEffect(() => {
    let active = true
    readLlmSettings().then((value) => {
      if (active) setLlm(value)
    })
    return () => {
      active = false
    }
  }, [])

  const noKey = llm !== undefined && llm !== null && llm.source === 'none'
  const serviceDown = llm === null

  async function translationState() {
    if (llm !== undefined) return llm
    const value = await readLlmSettings()
    setLlm(value)
    return value
  }

  const retryService = useCallback(async () => {
    setLlmRetrying(true)
    try {
      setLlm(await readLlmSettings())
    } finally {
      setLlmRetrying(false)
    }
  }, [])

  useEffect(() => {
    if (llm !== null) return
    const retry = () => void retryService()
    window.addEventListener('focus', retry)
    return () => window.removeEventListener('focus', retry)
  }, [llm, retryService])

  function blockAdd(state: LlmSettingsView | null) {
    if (state === null) {
      notifyError('Сервис обработки текста недоступен. Попробуйте позже.')
      return
    }
    notifyError('Без API-ключа нельзя перевести текст', { href: '/settings', linkLabel: 'Указать ключ' })
  }

  const over = english.length > LIMIT || russian.length > LIMIT
  const both = Boolean(english.trim() && russian.trim())
  const onlyRussian = Boolean(russian.trim() && !english.trim())
  const onlyEnglish = Boolean(english.trim() && !russian.trim())
  const canSubmitText = Boolean(title.trim() && (english.trim() || russian.trim()) && !over)

  async function submitFile(event: FormEvent) {
    event.preventDefault()
    if (!file) {
      notify('Выберите файл книги')
      return
    }
    const state = await translationState()
    if (state === null) {
      blockAdd(null)
      return
    }
    if (state.source === 'none' && !canAddWithoutKey({ fileName: file.name })) {
      blockAdd(state)
      return
    }
    setPending(true)
    let textId: string | null = null
    let jobId: string | null = null
    const userTitle = title.trim()
    const bookTitle = userTitle || file.name.replace(/\.[^.]+$/, '') || 'Книга'
    try {
      void requestNotifications()
      const start = await startImport({ title: userTitle, topic, level, source: 'upload' })
      textId = start.textId
      jobId = start.jobId
      trackUpload({ id: start.jobId, textId: start.textId, title: bookTitle })
      const job = await uploadFile(`${start.serviceUrl}/v1/jobs/import/file`, start.token, file, (progress) => {
        updateUpload(start.textId, progress, 'uploading')
      })
      trackJob({ id: job.id, textId: start.textId, title: bookTitle, type: 'import' })
      notify('Файл загружен. Обработка продолжится в фоне')
      router.push('/')
    } catch (reason) {
      if (jobId) removeJob(jobId)
      if (textId) await cancelImport(textId)
      notifyError(reason instanceof Error ? reason.message : 'Не удалось загрузить текст')
      setPending(false)
    }
  }

  async function submitText(event: FormEvent) {
    event.preventDefault()
    const en = english.trim()
    const ru = russian.trim()
    if (!en && !ru) {
      notify('Введите английский или русский текст')
      return
    }
    if (en.length > LIMIT || ru.length > LIMIT) {
      notify(`Лимит — ${LIMIT.toLocaleString('ru-RU')} символов на текст. Сократите отрывок или загрузите книгу файлом`)
      return
    }
    const bookTitle = title.trim()
    if (!bookTitle) {
      notify('Укажите название')
      return
    }
    const state = await translationState()
    if (state === null) {
      blockAdd(null)
      return
    }
    if (state.source === 'none' && !canAddWithoutKey({ english: en, russian: ru })) {
      blockAdd(state)
      return
    }
    setPending(true)
    let textId: string | null = null
    let jobId: string | null = null
    try {
      void requestNotifications()
      const start = await startImport({ title: bookTitle, topic, level, source: 'text' })
      textId = start.textId
      jobId = start.jobId
      trackUpload({ id: start.jobId, textId: start.textId, title: bookTitle })
      updateUpload(start.textId, 5, 'parsing')
      const chunk = readChunkPrefs()
      const response = await fetch(`${start.serviceUrl}/v1/jobs/import/text`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${start.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: en,
          russian: ru || null,
          translate: true,
          source: 'text',
          chunkUnit: chunk.unit,
          chunkSize: chunk.size,
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(detailFrom(data, 'Не удалось начать обработку'))
      const job = data as StartedJob
      trackJob({ id: job.id, textId: start.textId, title: bookTitle, type: 'import' })
      notify(both ? 'Тексты отправлены на выравнивание' : 'Текст отправлен на перевод')
      router.push('/')
    } catch (reason) {
      if (jobId) removeJob(jobId)
      if (textId) await cancelImport(textId)
      notifyError(reason instanceof Error ? reason.message : 'Не удалось добавить текст')
      setPending(false)
    }
  }

  if (busyJob) return <BusyNotice title="Добавить" />

  return (
    <div>
      <header className="header">
        <h1>Добавить</h1>
      </header>
      <div className="pad stack">
        {noKey || serviceDown ? (
          <div style={hasAlerts ? { visibility: 'hidden' } : undefined}>
            <LlmNotice
              kind={noKey ? 'key' : 'service'}
              onRetry={noKey ? undefined : retryService}
              retrying={llmRetrying}
            />
          </div>
        ) : null}
        <form className="stack" onSubmit={(event) => void submitFile(event)}>
          <div className="card stack">
            <div className="field">
              <span>Файл книги</span>
              <input
                id="book-file"
                type="file"
                className={styles.fileInput}
                accept={ACCEPT}
                disabled={pending}
                onChange={(event) => {
                  const next = event.target.files?.[0] ?? null
                  setFile(next)
                  if (next) setManual(false)
                }}
              />
              <label
                htmlFor="book-file"
                className="btn ghost slim"
                style={{ width: 'auto', alignSelf: 'flex-start', pointerEvents: pending ? 'none' : undefined }}
              >
                {file ? 'Выбрать другой файл' : 'Выбрать файл'}
              </label>
              <span className="muted">
                {file ? file.name : 'TXT, FB2, EPUB, DOCX, Markdown, .2books — до 30 МБ · автоперевод до 200 000 символов'}
              </span>
            </div>
            <div className="field">
              <span>Язык книги</span>
              <span className="muted">
                Определяется автоматически. Поддерживаются английский и русский; другие языки будут отклонены.
                Русский текст переводится на английский.
              </span>
            </div>
          </div>
          <label className="field">
            <span>Название</span>
            <input className="input" value={title} placeholder="Если пусто, возьмём из текста" onChange={(event) => setTitle(event.target.value)} />
            <span className="muted">
              {manual ? 'Для ручного ввода название обязательно' : 'Для файла можно оставить пустым — возьмём из текста'}
            </span>
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
          <button className="btn" disabled={pending || !file} type="submit">
            {pending ? 'Загружаю…' : 'Загрузить книгу'}
          </button>
          <p className="small muted" style={{ margin: 0 }}>
            Обработка продолжится в фоне — текст появится в подборке.
          </p>
        </form>

        <hr className="line" />

        <button type="button" className="btn ghost" onClick={() => setManual((value) => !value)}>
          {manual ? 'Скрыть ручной ввод' : 'Добавить текст вручную'}
        </button>

        {manual ? (
          <form className="stack" onSubmit={(event) => void submitText(event)}>
            <label className="field">
              <span>Английский текст</span>
              <textarea
                className={`input ${styles.grow}`}
                rows={8}
                value={english}
                onChange={(event) => {
                  setEnglish(event.target.value)
                  grow(event)
                }}
              />
              <span className={english.length > LIMIT ? `${styles.counter} ${styles.bad}` : styles.counter}>{counter(english)}</span>
            </label>
            <label className="field">
              <span>Русский текст</span>
              <textarea
                className={`input ${styles.grow}`}
                rows={8}
                value={russian}
                onChange={(event) => {
                  setRussian(event.target.value)
                  grow(event)
                }}
              />
              <span className={russian.length > LIMIT ? `${styles.counter} ${styles.bad}` : styles.counter}>{counter(russian)}</span>
            </label>
            <p className="small muted" style={{ margin: 0 }}>
              {both
                ? 'Оба текста заполнены — система только соотнесёт их, перевода не будет.'
                : onlyRussian
                  ? 'Заполнен только русский текст — он будет переведён на английский.'
                  : onlyEnglish
                    ? 'Заполнен только английский текст — он будет переведён на русский.'
                    : 'Заполните одно или оба поля. Второй язык переведём автоматически.'}
            </p>
            <p className="small muted" style={{ margin: 0 }}>
              Разделяйте абзацы пустой строкой — так соответствие между языками будет точнее.
            </p>
            <button className="btn" disabled={pending || !canSubmitText} type="submit">
              {pending ? 'Отправляю…' : 'Добавить текст'}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  )
}
