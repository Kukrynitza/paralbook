'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { BookOpen, Clock, FilePlus, Globe, Sparkles, Trash2 } from 'lucide-react'
import { maxValue, minLength, minValue, number, picklist, pipe, safeParse, string, trim } from 'valibot'
import deleteChatMessage from '@/actions/Chat/deleteChatMessage'
import generateText from '@/actions/Chat/generateText'
import selectChat from '@/actions/Chat/selectChat'
import syncChatJobs from '@/actions/Chat/syncChatJobs'
import publishText from '@/actions/Collection/publishText'
import deleteText from '@/actions/Reading/deleteText'
import { LEVELS, type Cefr, type ChatMessage, type LlmSettingsView } from '@/sorse/types'
import { useAuth, useUi } from '@/contexts/AuthContext'
import { useJobs } from '@/contexts/JobContext'
import ConfirmDialog from '@/components/ConfirmDialog/ConfirmDialog'
import PublishedBadge from '@/components/PublishedBadge/PublishedBadge'
import LlmNotice from '@/components/LlmNotice/LlmNotice'
import { preview } from '@/sorse/preview'
import { readLlmSettings } from '@/sorse/llmClient'
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

const PROMPTS = [
  { text: 'Детектив в Лондоне, 10 минут', tone: 'blue' },
  { text: 'Путешествие по Исландии, 15 минут', tone: 'teal' },
  { text: 'Научная статья о сне, 10 минут', tone: 'purple' },
  { text: 'История про уточку, 5 минут', tone: 'orange' },
] as const

function pick<T>(items: readonly T[]) {
  return items[Math.floor(Math.random() * items.length)]
}

export default function Page() {
  const { user } = useAuth()
  const { confirm, notify, notifyError } = useUi()
  const { trackJob, jobs, revision, busyJob } = useJobs()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loaded, setLoaded] = useState(false)
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('')
  const [activeJob, setActiveJob] = useState<string | null>(null)
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const [publishBusy, setPublishBusy] = useState(false)
  const [publishConfirm, setPublishConfirm] = useState(false)
  const [llm, setLlm] = useState<LlmSettingsView | null | undefined>(undefined)
  const [llmRetrying, setLlmRetrying] = useState(false)
  const seenJob = useRef(false)

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

  async function load() {
    const data = await selectChat()
    setMessages(data.messages)
    setLoaded(true)
  }

  useEffect(() => {
    let active = true
    syncChatJobs()
      .catch(() => undefined)
      .then(() => selectChat())
      .then((data) => {
        if (!active) return
        setMessages(data.messages)
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoaded(true)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!activeJob) {
      seenJob.current = false
      return
    }
    const job = jobs.find((item) => item.id === activeJob)
    if (!job) {
      if (!seenJob.current) return
      seenJob.current = false
      setActiveJob(null)
      setPending(false)
      setProgress(0)
      setStage('')
      return
    }
    seenJob.current = true
    setProgress(job.progress)
    setStage(job.stage ?? '')
    if (job.status === 'done' || job.status === 'error') {
      seenJob.current = false
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
    const state = await translationState()
    if (state === null) {
      notifyError('Сервис обработки текста недоступен. Попробуйте позже.')
      return
    }
    if (state.source === 'none') {
      notifyError('Без API-ключа нельзя сгенерировать текст', { href: '/settings', linkLabel: 'Указать ключ' })
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
      notifyError(reason instanceof Error ? reason.message : 'Не удалось')
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
    } catch (reason) {
      notifyError(reason instanceof Error ? reason.message : 'Не удалось удалить')
      return
    }
    try {
      await load()
    } catch {
      notifyError('Запрос удалён, но чат не обновился. Обновите страницу.')
    }
  }

  async function remove(textId: string) {
    const ok = await confirm('Удалить текст?')
    if (!ok) return
    try {
      await deleteText(textId)
    } catch (reason) {
      notifyError(reason instanceof Error ? reason.message : 'Не удалось удалить')
      return
    }
    try {
      await load()
    } catch {
      notifyError('Текст удалён, но чат не обновился. Обновите страницу.')
    }
  }

  async function publish() {
    if (!publishingId || !publishConfirm) return
    setPublishBusy(true)
    try {
      await publishText(publishingId)
    } catch (reason) {
      notifyError(reason instanceof Error ? reason.message : 'Не удалось опубликовать')
      setPublishBusy(false)
      return
    }
    setPublishingId(null)
    setPublishConfirm(false)
    notify('Текст опубликован')
    try {
      await load()
    } catch {
      notifyError('Текст опубликован, но чат не обновился. Обновите страницу.')
    } finally {
      setPublishBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <header className="header">
        <h1>Чат</h1>
      </header>
      <p className={styles.lead}>Опишите тему — соберу текст с переводом</p>
      <div className={styles.thread} style={{ flex: 1 }}>
        {!loaded ? <p className="loading">Загрузка…</p> : null}
        {loaded && !messages.length && !pending && !busyJob ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>
              <Sparkles size={20} />
            </span>
            <h2>О чём почитать?</h2>
            <p>Можно указать время и уровень. Например: «детектив, 10 минут, B1».</p>
            <div className={styles.prompts}>
              {PROMPTS.map((prompt) => (
                <button
                  key={prompt.text}
                  type="button"
                  className={`${styles.prompt} ${styles[prompt.tone]}`}
                  onClick={() => void send(prompt.text)}
                >
                  {prompt.text}
                </button>
              ))}
            </div>
          </div>
        ) : null}
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
              <div className={`${styles.bubble} ${styles.assistant}`} key={message.id}>
                {message.text}
              </div>
            )
          }
          if (message.role === 'error') {
            return (
              <div className={`card ${styles.alarm}`} key={message.id}>
                <p className={styles.alarmText}>{message.text}</p>
                <div className={styles.alarmActions}>
                  {/ключ|не настроена/i.test(message.text) ? (
                    <Link className="btn ghost slim" href="/settings">
                      Указать ключ
                    </Link>
                  ) : null}
                  <button
                    className="btn soft slim"
                    onClick={() => send(message.retry.topic, message.retry.minutes, message.retry.level)}
                  >
                    Повторить
                  </button>
                </div>
              </div>
            )
          }
          if (message.role !== 'result' || !message.text) return null
          const card = message.text
          return (
            <article className={`card ${styles.result}`} key={message.id}>
              <div className={styles.resultTop}>
                <span className={styles.resultIcon} data-level={card.level}>
                  <BookOpen size={16} />
                </span>
                <div className={styles.resultHead}>
                  <h3>{card.title}</h3>
                  <div className={styles.resultMeta}>
                    <span className={styles.level} data-level={card.level}>
                      {card.level}
                    </span>
                    <span className={styles.metaItem}>
                      <Clock size={12} />
                      {card.minutes} мин
                    </span>
                    {card.published ? <PublishedBadge /> : null}
                  </div>
                </div>
              </div>
              <p className={styles.excerpt}>{preview(card.excerpt)}</p>
              <div className={styles.resultActions}>
                <Link className="btn slim" href={`/read/${card.id}`}>
                  Читать
                </Link>
                {card.published ? null : (
                  <>
                    <button className="btn soft slim" onClick={() => { setPublishConfirm(false); setPublishingId(card.id) }}>
                      <Globe size={14} />
                      Опубликовать в библиотеку
                    </button>
                    <button className={`btn ghost slim ${styles.delete}`} onClick={() => remove(card.id)}>
                      <Trash2 size={14} />
                      Удалить
                    </button>
                  </>
                )}
              </div>
            </article>
          )
        })}
        {pending ? (
          <div className={styles.wait}>
            <span className={styles.waitTitle}>Собираю текст{progress ? ` · ${progress}%` : ''}</span>
            <div className="bar">
              <i style={{ width: `${Math.max(4, progress)}%` }} />
            </div>
            <span className={styles.waitStage}>
              {stage === 'generating'
                ? 'генерирую'
                : stage === 'aligning'
                  ? 'выравниваю'
                  : stage === 'saving'
                    ? 'сохраняю'
                    : 'подготавливаю'}
            </span>
          </div>
        ) : null}
      </div>
      {noKey ? (
        <div className={styles.notice}>
          <LlmNotice kind="key" />
        </div>
      ) : serviceDown ? (
        <div className={styles.notice}>
          <LlmNotice kind="service" onRetry={retryService} retrying={llmRetrying} />
        </div>
      ) : null}
      <form
        className={styles.composer}
        onSubmit={(event) => {
          event.preventDefault()
          void send(draft)
        }}
      >
        <Link className={styles.own} href="/text">
          <FilePlus size={15} />
          Добавить текст
        </Link>
        <input className="input" value={draft} placeholder="Тема и время чтения" onChange={(event) => setDraft(event.target.value)} />
        <button className={styles.send} aria-label="Отправить" title="Отправить" disabled={pending || Boolean(busyJob)}>
          →
        </button>
      </form>
      <ConfirmDialog
        open={Boolean(publishingId)}
        title="Опубликовать текст?"
        confirmLabel="Опубликовать"
        busyLabel="Публикую…"
        busy={publishBusy}
        confirmDisabled={!publishConfirm}
        onClose={() => { setPublishingId(null); setPublishConfirm(false) }}
        onConfirm={() => void publish()}
      >
        <p>Текст появится в общей библиотеке и станет виден другим пользователям.</p>
        <p className="small muted">
          Текст смогут читать, оценивать и добавлять в свою подборку. Он попадёт в поиск и рейтинг библиотеки;
          убрать его из библиотеки после публикации нельзя.
        </p>
        <label className="row small" style={{ justifyContent: 'flex-start', alignItems: 'flex-start' }}>
          <input
            type="checkbox"
            checked={publishConfirm}
            onChange={(event) => setPublishConfirm(event.target.checked)}
            style={{ marginTop: 2 }}
          />
          <span>
            Подтверждаю, что текст не содержит непристойного, оскорбительного или запрещённого контента.
          </span>
        </label>
      </ConfirmDialog>
    </div>
  )
}
