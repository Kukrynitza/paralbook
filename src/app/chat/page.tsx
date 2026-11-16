'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { maxValue, minLength, minValue, number, picklist, pipe, safeParse, string, trim } from 'valibot'
import deleteChatMessage from '@/actions/Chat/deleteChatMessage'
import generateText from '@/actions/Chat/generateText'
import selectChat from '@/actions/Chat/selectChat'
import syncChatJobs from '@/actions/Chat/syncChatJobs'
import selectCollection from '@/actions/Collection/selectCollection'
import publishCollection from '@/actions/Collection/publishCollection'
import deleteText from '@/actions/Reading/deleteText'
import { LEVELS, type Cefr, type ChatMessage } from '@/sorse/types'
import { useAuth, useUi } from '@/contexts/AuthContext'
import { statusLabel, useJobs } from '@/contexts/JobContext'
import ConfirmDialog from '@/components/ConfirmDialog/ConfirmDialog'
import { preview } from '@/sorse/preview'
import styles from './page.module.css'

const topicSchema = pipe(string(), trim(), minLength(1, 'Напишите тему'))
const minutesSchema = pipe(number('Минуты от 1 до 60'), minValue(1, 'Минуты от 1 до 60'), maxValue(60, 'Минуты от 1 до 60'))
const levelSchema = picklist(LEVELS, 'Неизвестный уровень')

function askedMinutes(text: string) {
  const found: number[] = []
  if (/полчаса/iu.test(text)) found.push(30)
  for (const match of text.matchAll(/(\d+)\s*час/giu)) found.push(Number(match[1]) * 60)
  const withoutHalf = text.replace(/полчаса/giu, ' ')
  if (/(?<![\p{L}\d])час(?:а|ов|е|у)?(?![\p{L}])/iu.test(withoutHalf)) found.push(60)
  for (const match of text.matchAll(/(\d+)\s*мин/giu)) found.push(Number(match[1]))
  if (!found.length) return null
  return Math.min(60, Math.max(...found))
}

const DURATIONS = [10, 15, 20, 30, 45, 60]

function pick<T>(items: readonly T[]) {
  return items[Math.floor(Math.random() * items.length)]
}

export default function Page() {
  const { user } = useAuth()
  const { confirm, notify } = useUi()
  const { trackJob, jobs, revision, busyJob } = useJobs()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('')
  const [activeJob, setActiveJob] = useState<string | null>(null)
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const [publishBusy, setPublishBusy] = useState(false)

  async function load() {
    const data = await selectChat()
    setMessages(data.messages)
  }

  useEffect(() => {
    let active = true
    syncChatJobs()
      .catch(() => undefined)
      .then(() => selectChat())
      .then((data) => active && setMessages(data.messages))
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!activeJob) return
    const job = jobs.find((item) => item.id === activeJob)
    if (!job) return
    setProgress(job.progress)
    setStage(job.stage ?? '')
    if (job.status === 'done' || job.status === 'error') {
      setActiveJob(null)
      setPending(false)
      setProgress(0)
      setStage('')
      void load().catch((reason: unknown) => {
        notify(reason instanceof Error ? reason.message : 'Не удалось обновить чат')
      })
    }
  }, [activeJob, jobs, notify])

  useEffect(() => {
    if (!revision) return
    void load().catch((reason: unknown) => {
      notify(reason instanceof Error ? reason.message : 'Не удалось обновить чат')
    })
  }, [revision, notify])

  async function send(topic: string, minutes?: number, level?: Cefr) {
    const clean = topic.trim()
    if (!clean || !user) return
    if (busyJob) {
      notify('Дождитесь завершения текущей задачи')
      return
    }
    const parsedMinutes = askedMinutes(clean) ?? minutes ?? pick(DURATIONS)
    const found = clean.match(/\b(A1|A2|B1|B2|C1|C2)\b/i)
    const levelFromText = found?.[1].toUpperCase() as Cefr | undefined
    const parsedLevel = levelFromText ?? level ?? user.cefr
    const parsedTopic = clean
      .replace(/полчаса/giu, ' ')
      .replace(/,?\s*\d+\s*час\S*/giu, ' ')
      .replace(/(?<![\p{L}\d])час(?:а|ов|е|у)?(?![\p{L}])/giu, ' ')
      .replace(/,?\s*\d+\s*мин\S*/giu, ' ')
      .replace(/,?\s*уровень\s*[abc][12]/giu, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/,\s*$/i, '')
      .trim()
    const topicCheck = safeParse(topicSchema, parsedTopic || clean)
    if (!topicCheck.success) {
      notify(topicCheck.issues[0].message)
      return
    }
    const minutesCheck = safeParse(minutesSchema, parsedMinutes)
    if (!minutesCheck.success) {
      notify(minutesCheck.issues[0].message)
      return
    }
    const levelCheck = safeParse(levelSchema, parsedLevel)
    if (!levelCheck.success) {
      notify(levelCheck.issues[0].message)
      return
    }
    setPending(true)
    setProgress(0)
    setStage('generating')
    setDraft('')
    try {
      const job = await generateText({ topic: topicCheck.output, minutes: minutesCheck.output, level: levelCheck.output })
      trackJob({ id: job.jobId, textId: job.textId, title: topicCheck.output, type: 'chat' })
      setActiveJob(job.jobId)
      await load()
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Не удалось')
      setPending(false)
      setProgress(0)
      setStage('')
      await load().catch(() => undefined)
    }
  }

  async function removePrompt(messageId: string) {
    const ok = await confirm('Удалить запрос?')
    if (!ok) return
    try {
      await deleteChatMessage(messageId)
      await load()
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Не удалось удалить')
    }
  }

  async function remove(textId: string) {
    const ok = await confirm('Удалить текст?')
    if (!ok) return
    try {
      await deleteText(textId)
      await load()
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Не удалось удалить')
    }
  }

  async function publish() {
    if (!publishingId) return
    setPublishBusy(true)
    try {
      const list = await selectCollection('new', 1)
      const entry = list.items.find((item) => item.textId === publishingId)
      if (!entry) throw new Error('В подборке нет такого текста')
      await publishCollection(entry.id)
      setPublishingId(null)
      await load()
      notify('Текст опубликован')
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Не удалось опубликовать')
    } finally {
      setPublishBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <header className="header">
        <h1>Чат</h1>
      </header>
      <div className={styles.thread} style={{ flex: 1 }}>
        {messages.map((message) => {
          if (message.role === 'user') {
            return (
              <div className={`${styles.bubble} ${styles.user}`} key={message.id}>
                <span>{message.text}</span>
                <button className={styles.drop} type="button" aria-label="Удалить запрос" onClick={() => removePrompt(message.id)}>
                  ×
                </button>
              </div>
            )
          }
          if (message.role === 'assistant') {
            return (
              <div className={styles.bubble} key={message.id}>
                {message.text}
              </div>
            )
          }
          if (message.role === 'error') {
            return (
              <div className={`card ${styles.alarm}`} key={message.id}>
                <p className={styles.alarmText}>{message.text}</p>
                <button className="btn" style={{ marginTop: 16 }} onClick={() => send(message.retry.topic, message.retry.minutes, message.retry.level)}>
                  Повторить
                </button>
              </div>
            )
          }
          if (message.role !== 'result' || !message.text) return null
          const card = message.text
          return (
            <article className={`card ${styles.result}`} key={message.id}>
              <h3>{card.title}</h3>
              <p>{preview(card.excerpt)}</p>
              <div className="meta">
                {card.minutes} мин · {card.level}
              </div>
              <div className="actions">
                <Link className="btn slim" href={`/read/${card.id}`}>
                  Читать
                </Link>
                {card.published ? null : (
                  <button className="btn ghost wrap" onClick={() => setPublishingId(card.id)}>
                    Опубликовать в библиотеку
                  </button>
                )}
                <button className="btn danger slim" onClick={() => remove(card.id)}>
                  Удалить
                </button>
              </div>
            </article>
          )
        })}
        {pending ? (
          <div className={styles.wait}>
            Собираю текст…{progress ? ` ${progress}%` : ''}
            {stage === 'generating' ? ' · генерирую' : stage === 'aligning' ? ' · выравниваю' : stage === 'saving' ? ' · сохраняю' : ''}
          </div>
        ) : null}
      </div>
      {busyJob ? (
        <div className={styles.busy}>
          <strong>Сейчас выполняется: {busyJob.title}</strong>
          <div className="bar"><i style={{ width: `${Math.max(2, busyJob.progress)}%` }} /></div>
          <div className="row small muted">
            <span>{statusLabel(busyJob.stage)}</span>
            <span>{busyJob.progress}%</span>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Новый запрос можно отправить после завершения. Можно уйти — прогресс останется внизу.
          </p>
        </div>
      ) : (
        <form
          className={styles.composer}
          onSubmit={(event) => {
            event.preventDefault()
            void send(draft)
          }}
        >
          <Link className={styles.own} href="/text">
            Добавить текст
          </Link>
          <input className="input" value={draft} placeholder="Тема и время чтения" onChange={(event) => setDraft(event.target.value)} />
          <button className={styles.send} aria-label="Отправить" title="Отправить" disabled={pending}>
            →
          </button>
        </form>
      )}
      <ConfirmDialog
        open={Boolean(publishingId)}
        title="Опубликовать текст?"
        confirmLabel="Опубликовать"
        busyLabel="Публикую…"
        busy={publishBusy}
        onClose={() => setPublishingId(null)}
        onConfirm={() => void publish()}
      >
        <p>Текст появится в общей библиотеке и станет виден другим пользователям.</p>
        <ul>
          <li>его смогут читать, оценивать и добавлять в свою подборку;</li>
          <li>он попадёт в поиск и рейтинг библиотеки;</li>
          <li>убрать текст из библиотеки после публикации нельзя.</li>
        </ul>
      </ConfirmDialog>
    </div>
  )
}
