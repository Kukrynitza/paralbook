'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { maxValue, minLength, minValue, number, picklist, pipe, safeParse, string, trim } from 'valibot'
import generateText from '@/actions/Chat/generateText'
import selectChat from '@/actions/Chat/selectChat'
import selectCollection from '@/actions/Collection/selectCollection'
import publishCollection from '@/actions/Collection/publishCollection'
import deleteText from '@/actions/Reading/deleteText'
import { LEVELS, type Cefr, type ChatMessage } from '@/sorse/types'
import { useAuth, useUi } from '@/contexts/AuthContext'
import styles from './page.module.css'

const topicSchema = pipe(string(), trim(), minLength(1, 'Напишите тему'))
const minutesSchema = pipe(number('Минуты от 1 до 60'), minValue(1, 'Минуты от 1 до 60'), maxValue(60, 'Минуты от 1 до 60'))
const levelSchema = picklist(LEVELS, 'Неизвестный уровень')

export default function Page() {
  const { user } = useAuth()
  const { confirm, notify } = useUi()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)

  async function load() {
    const data = await selectChat()
    setMessages(data.messages)
  }

  useEffect(() => {
    let active = true
    selectChat().then((data) => active && setMessages(data.messages))
    return () => {
      active = false
    }
  }, [])

  async function send(topic: string, minutes?: number, level?: Cefr) {
    const clean = topic.trim()
    if (!clean || !user) return
    const parsedMinutes = Number(clean.match(/(\d+)\s*мин/)?.[1] ?? minutes ?? 5)
    const found = clean.match(/\b(A1|A2|B1|B2|C1|C2)\b/i)
    const parsedLevel = (found?.[1].toUpperCase() as Cefr | undefined) ?? level ?? user.cefr
    const parsedTopic = clean
      .replace(/,?\s*\d+\s*мин\S*/i, '')
      .replace(/,?\s*уровень\s*[abc][12]/i, '')
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
    setDraft('')
    try {
      await generateText({ topic: topicCheck.output, minutes: minutesCheck.output, level: levelCheck.output })
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Не удалось')
    } finally {
      try {
        await load()
      } catch (reason) {
        notify(reason instanceof Error ? reason.message : 'Не удалось обновить чат')
      }
      setPending(false)
    }
  }

  async function remove(textId: string) {
    const ok = await confirm('Удалить текст?')
    if (!ok) return
    await deleteText(textId)
    await load()
  }

  async function publish(entryId: string) {
    const list = await selectCollection('new', 1)
    const entry = list.items.find((item) => item.textId === entryId)
    if (!entry) return
    await publishCollection(entry.id)
    await load()
    notify('Текст опубликован')
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
                {message.text}
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
              <div className="card" key={message.id}>
                <p className="form-error" style={{ margin: 0 }}>
                  {message.text}
                </p>
                <button className="btn slim" style={{ marginTop: 12 }} onClick={() => send(message.retry.topic, message.retry.minutes, message.retry.level)}>
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
              <p>{card.excerpt}</p>
              <div className="meta">
                {card.minutes} мин · {card.level}
              </div>
              <div className="actions">
                <Link className="btn slim" href={`/read/${card.id}`}>
                  Читать
                </Link>
                {card.published ? null : (
                  <button className="btn ghost wrap" onClick={() => publish(card.id)}>
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
        {pending ? <div className={styles.bubble}>Собираю текст…</div> : null}
      </div>
      <form
        className={styles.composer}
        onSubmit={(event) => {
          event.preventDefault()
          void send(draft)
        }}
      >
        <input className="input" value={draft} placeholder="Тема и время чтения" onChange={(event) => setDraft(event.target.value)} />
        <button className={styles.send} aria-label="Отправить" disabled={pending}>
          →
        </button>
      </form>
    </div>
  )
}
