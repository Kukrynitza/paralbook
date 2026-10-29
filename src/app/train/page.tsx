'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, Flame } from 'lucide-react'
import reviewCard from '@/actions/Training/reviewCard'
import startSession from '@/actions/Training/startSession'
import WordCard from '@/components/WordCard/WordCard'
import { type Session } from '@/sorse/types'
import { readTraining } from '@/sorse/prefs'
import styles from './page.module.css'

export default function Page() {
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [hint, setHint] = useState(false)
  const [translation, setTranslation] = useState(false)
  const [hintSeen, setHintSeen] = useState(false)
  const [summary, setSummary] = useState(false)
  const [error, setError] = useState('')
  const [leave, setLeave] = useState<'no' | 'yes' | null>(null)

  useEffect(() => {
    let active = true
    const setup = readTraining()
    startSession(setup.fresh, setup.total)
      .then((next) => {
        if (!active) return
        setSession(next)
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Не удалось начать тренировку')
      })
    return () => {
      active = false
    }
  }, [])

  async function answer(remembered: boolean) {
    if (!session || leave) return
    setLeave(remembered ? 'yes' : 'no')
    const motion = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const [next] = await Promise.all([
      reviewCard(session.id, remembered),
      motion ? new Promise((resolve) => setTimeout(resolve, 480)) : Promise.resolve(),
    ])
    setSession(next)
    setHint(false)
    setTranslation(false)
    setHintSeen(false)
    setLeave(null)
  }

  if (session?.done && summary && session.summary) {
    const item = session.summary
    const ratio = item.goalMin ? Math.min(100, Math.round((item.todayMin / item.goalMin) * 100)) : 0
    return (
      <div>
        <header className="header">
          <h1>Итог сессии</h1>
        </header>
        <div className="pad stack" style={{ textAlign: 'center' }}>
          <div className={styles.done}>
            <Check size={32} />
          </div>
          <h2 style={{ margin: 0 }}>Отличная работа</h2>
          <p className="muted">{item.compliment}</p>
          <div className={styles.metrics}>
            <div className={styles.metric}>
              <b>{item.minutes}</b>
              <span className="muted">минут</span>
            </div>
            <div className={styles.metric}>
              <b>{item.words}</b>
              <span className="muted">слов</span>
            </div>
          </div>
          <div className="card" style={{ textAlign: 'left' }}>
            <div className="row">
              <Flame size={20} color="var(--accent)" />
              <div>
                <strong>Серия {item.streak} дн.</strong>
                <div className="small muted">Вы возвращаетесь день за днём</div>
              </div>
            </div>
          </div>
          <div className="card" style={{ textAlign: 'left' }}>
            <div className="row">
              <span>Цель дня</span>
              <span>
                {item.todayMin}/{item.goalMin}
              </span>
            </div>
            <div className="bar" style={{ marginTop: 12 }}>
              <i style={{ width: `${ratio}%` }} />
            </div>
          </div>
          <button className="btn" onClick={() => router.push('/')}>
            На главную
          </button>
        </div>
      </div>
    )
  }

  if (session?.done) {
    return (
      <div className="empty">
        <div className={styles.done}>
          <Check size={32} />
        </div>
        <h2>Сессия завершена</h2>
        <p>
          Верно: {session.summary?.correct ?? 0} · Ошибки: {session.summary?.wrong ?? 0}
        </p>
        <button className="btn" onClick={() => setSummary(true)}>
          Итог
        </button>
      </div>
    )
  }

  if (session?.card) {
    const ratio = session.total ? Math.round((session.index / session.total) * 100) : 0
    return (
      <div>
        <header className="header">
          <button className="back" onClick={() => router.push('/vocabulary')} aria-label="Назад">
            <ArrowLeft size={22} />
          </button>
          <div className="grow">Тренировка слов</div>
          <span style={{ width: 24 }} />
        </header>
        <div className="bar">
          <i style={{ width: `${ratio}%` }} />
        </div>
        <div className={styles.deck}>
          {session.next ? (
            <div className={`${styles.face} ${styles.peek}`} aria-hidden="true">
              <h2>{session.next.lemma}</h2>
            </div>
          ) : null}
          <div key={session.index} className={leave ? `${styles.flipper} ${leave === 'no' ? styles.leaveNo : styles.leaveYes}` : `${styles.flipper} ${styles.enter}`}>
            <WordCard
              card={session.card}
              flipped={hint}
              showTranslation={translation}
              hintSeen={hintSeen}
              reviewLabel={`Повтор ${Math.min(6, session.card.review + 1)}`}
              onHint={() => setHint(true)}
              onTranslation={() => setTranslation(true)}
              onBack={() => {
                setHint(false)
                setHintSeen(true)
              }}
            />
          </div>
        </div>
        <div className="actions pad">
          <button className="btn yes" disabled={leave !== null} onClick={() => answer(true)}>
            <ArrowLeft size={16} />
            Знаю
          </button>
          <button className="btn no" disabled={leave !== null} onClick={() => answer(false)}>
            Не знаю
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="empty">
        <h2>Тренировка не началась</h2>
        <p>{error}</p>
        <button className="btn" onClick={() => router.push('/vocabulary')}>
          К словарю
        </button>
      </div>
    )
  }

  return <p className="loading">Загрузка…</p>
}
