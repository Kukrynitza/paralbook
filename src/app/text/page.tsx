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
import styles from './page.module.css'

const LIMIT = 200_000

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

export default function Page() {
  const { user } = useAuth()
  const { notify } = useUi()
  const { busyJob, trackJob, trackUpload, updateUpload, removeJob, requestNotifications } = useJobs()
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [topic, setTopic] = useState('')
  const [level, setLevel] = useState<Cefr>(user?.cefr ?? 'B1')
  const [english, setEnglish] = useState('')
  const [russian, setRussian] = useState('')
  const [pending, setPending] = useState(false)

  const over = english.length > LIMIT || russian.length > LIMIT
  const both = Boolean(english.trim() && russian.trim())
  const onlyRussian = Boolean(russian.trim() && !english.trim())
  const onlyEnglish = Boolean(english.trim() && !russian.trim())

  async function submit(event: FormEvent) {
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
    setPending(true)
    let textId: string | null = null
    const bookTitle = title.trim() || 'Свой текст'
    try {
      void requestNotifications()
      const start = await startImport({ title: bookTitle, topic, level })
      textId = start.textId
      trackUpload({ textId: start.textId, title: bookTitle })
      updateUpload(start.textId, 5, 'parsing')
      const response = await fetch(`${start.serviceUrl}/v1/jobs/import/text`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${start.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: en, russian: ru || null, translate: true, source: 'text' }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(detailFrom(data, 'Не удалось начать обработку'))
      const job = data as StartedJob
      trackJob({ id: job.id, textId: start.textId, title: bookTitle, type: 'import' })
      notify(both ? 'Тексты отправлены на выравнивание' : 'Текст отправлен на перевод')
      router.push('/')
    } catch (reason) {
      if (textId) {
        removeJob(`local-${textId}`)
        await cancelImport(textId)
      }
      notify(reason instanceof Error ? reason.message : 'Не удалось добавить текст')
      setPending(false)
    }
  }

  if (busyJob) return <BusyNotice title="Добавить текст" />

  return (
    <div>
      <header className="header">
        <h1>Добавить текст</h1>
      </header>
      <form className="pad stack" onSubmit={(event) => void submit(event)}>
        <label className="field">
          <span>Название</span>
          <input className="input" value={title} placeholder="Если пусто, будет «Свой текст»" onChange={(event) => setTitle(event.target.value)} />
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
          <span>Английский текст</span>
          <textarea className="input" rows={9} value={english} onChange={(event) => setEnglish(event.target.value)} />
          <span className={english.length > LIMIT ? `${styles.counter} ${styles.bad}` : styles.counter}>{counter(english)}</span>
        </label>
        <label className="field">
          <span>Русский текст</span>
          <textarea className="input" rows={9} value={russian} onChange={(event) => setRussian(event.target.value)} />
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
        <button className="btn" disabled={pending || over} type="submit">
          {pending ? 'Отправляю…' : 'Открыть в читалке'}
        </button>
        <Link className="btn ghost slim" href="/upload">
          Загрузить книгу файлом
        </Link>
      </form>
    </div>
  )
}
