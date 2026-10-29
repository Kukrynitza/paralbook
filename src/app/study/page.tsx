'use client'

import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import practiceWord from '@/actions/Training/practiceWord'
import recordStudy from '@/actions/Training/recordStudy'
import selectStudyCard from '@/actions/Training/selectStudyCard'
import studyDeck, { type StudyDeck } from '@/actions/Training/studyDeck'
import WordCard from '@/components/WordCard/WordCard'
import { useAuth, useUi } from '@/contexts/AuthContext'
import { readDailyNew } from '@/sorse/prefs'
import { type SessionCard } from '@/sorse/types'
import styles from './page.module.css'

const MODES = [
  ['learn', 'Новые'],
  ['mixed', 'Смешанное'],
  ['review', 'Повторение'],
] as const

const NO_WORDS: string[] = []

export default function Page() {
  return (
    <Suspense fallback={<p className="loading">Загрузка…</p>}>
      <Study />
    </Suspense>
  )
}

function Study() {
  const router = useRouter()
  const search = useSearchParams()
  const { user } = useAuth()
  const { notify } = useUi()
  const mode = search.get('mode') || 'mixed'
  const extra = search.get('extra') === '1'
  const [packs, setPacks] = useState<string[]>(() => (search.get('packs') || '').split(',').filter(Boolean))
  const [daily, setDaily] = useState(10)
  const [deck, setDeck] = useState<StudyDeck | null>(null)
  const [lockUntil, setLockUntil] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const [card, setCard] = useState<SessionCard | null>(null)
  const [flipped, setFlipped] = useState(false)
  const [translation, setTranslation] = useState(false)
  const [hintSeen, setHintSeen] = useState(false)
  const [error, setError] = useState('')
  const [leave, setLeave] = useState<'no' | 'yes' | null>(null)
  const cache = useRef(new Map<string, SessionCard>())
  const missed = useRef(false)
  const openMisses = useRef(new Set<string>())
  const posted = useRef(new Set<string>())
  const lockAt = useRef<number | null>(null)
  const started = useRef(Date.now())
  const recorded = useRef(false)
  const [replay, setReplay] = useState<string[] | null>(null)
  const words = replay ?? deck?.lemmas ?? NO_WORDS

  useEffect(() => {
    setDaily(readDailyNew())
  }, [])

  useEffect(() => {
    if (!user) return
    setPacks((current) => (current.length ? current : [user.cefr]))
  }, [user])

  useEffect(() => {
    let active = true
    setIndex(0)
    setReplay(null)
    setError('')
    const dailyCount = Number(search.get('daily')) || readDailyNew()
    setCard(null)
    if (mode === 'review' && !extra) {
      const stored = window.localStorage.getItem('paralbook.studyLock')
      if (stored && new Date(stored).getTime() > Date.now()) {
        setLockUntil(stored)
        setDeck(null)
        studyDeck(packs, '', dailyCount)
          .then((next) => {
            if (!active) return
            setDeck(next)
            if (!next.nextDueAt) return
            const server = new Date(next.nextDueAt).getTime()
            const local = new Date(stored).getTime()
            if (server > Date.now() && server < local) {
              window.localStorage.setItem('paralbook.studyLock', next.nextDueAt)
              setLockUntil(next.nextDueAt)
            }
          })
          .catch(() => undefined)
        return () => {
          active = false
        }
      }
      window.localStorage.removeItem('paralbook.studyLock')
    }
    setLockUntil(null)
    setDeck(null)
    setReplay(null)
    studyDeck(packs, extra ? 'learn' : mode, dailyCount, extra)
      .then((next) => {
        if (!active) return
        setDeck(next)
        if (mode === 'review' && !extra && next.lemmas.length === 0 && next.nextDueAt && new Date(next.nextDueAt).getTime() > Date.now()) {
          window.localStorage.setItem('paralbook.studyLock', next.nextDueAt)
          setLockUntil(next.nextDueAt)
        }
      })
      .catch((reason: unknown) => {
        const message = reason instanceof Error ? reason.message : 'Не удалось собрать колоду'
        notify(message)
        if (active) setError(message)
      })
    return () => {
      active = false
    }
  }, [mode, packs, search, notify, extra])

  useEffect(() => {
    cache.current.clear()
    missed.current = false
    openMisses.current.clear()
    posted.current.clear()
    lockAt.current = null
    started.current = Date.now()
    recorded.current = false
    setLeave(null)
  }, [deck])

  useEffect(() => {
    const lemma = words[index]
    if (!mode || !lemma) return
    let active = true
    setFlipped(false)
    setTranslation(false)
    setHintSeen(false)
    const known = cache.current.get(lemma)
    if (known) setCard(known)
    else {
      setCard(null)
      selectStudyCard(lemma)
        .then((next) => {
          cache.current.set(lemma, next)
          if (active) setCard(next)
        })
        .catch((reason: unknown) => {
          if (active) setError(reason instanceof Error ? reason.message : 'Не удалось открыть карточку')
        })
    }
    for (const nextLemma of words.slice(index + 1, index + 3)) {
      if (cache.current.has(nextLemma)) continue
      selectStudyCard(nextLemma)
        .then((next) => cache.current.set(nextLemma, next))
        .catch(() => undefined)
    }
    return () => {
      active = false
    }
  }, [words, index, mode])

  function switchMode(next: string) {
    if (next === mode) return
    const query = new URLSearchParams({
      mode: next,
      packs: packs.join(','),
      daily: search.get('daily') || String(daily),
    })
    router.push(`/study?${query.toString()}`)
  }

  function answer(remembered: boolean) {
    if (!card || leave) return
    const gaps = [
      { minutes: 30, label: '30 минут' },
      { minutes: 12 * 60, label: '12 часов' },
      { minutes: 24 * 60, label: '1 день' },
      { minutes: 7 * 24 * 60, label: '7 дней' },
      { minutes: 30 * 24 * 60, label: '30 дней' },
      { minutes: 60 * 24 * 60, label: '2 месяца' },
    ]
    const lemma = card.lemma
    const review = card.review
    const atIndex = index
    const queue = words
    setLeave(remembered ? 'yes' : 'no')
    const motion = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.setTimeout(() => {
      if (!remembered) {
        openMisses.current.add(lemma)
        missed.current = true
        const at = Math.min(atIndex + 5, queue.length)
        const next = queue.slice()
        next.splice(at, 0, lemma)
        setReplay(next)
      } else {
        openMisses.current.delete(lemma)
        missed.current = openMisses.current.size > 0
        if (review < 6) {
          const gap = gaps[Math.min(review, gaps.length - 1)]
          const at = Date.now() + gap.minutes * 60_000
          if (!lockAt.current || at < lockAt.current) lockAt.current = at
        }
        post(lemma, true)
      }
      const nextLemma = queue[atIndex + 1]
      const nextCard = nextLemma ? cache.current.get(nextLemma) : undefined
      setFlipped(false)
      setTranslation(false)
      if (nextCard) setCard(nextCard)
      else if (nextLemma) setCard(null)
      setIndex(atIndex + 1)
      setLeave(null)
    }, motion ? 480 : 0)
  }

  function post(lemma: string, remembered: boolean) {
    if (posted.current.has(lemma)) return
    posted.current.add(lemma)
    void practiceWord(lemma, remembered).catch((reason: unknown) => {
      posted.current.delete(lemma)
      notify(reason instanceof Error ? reason.message : 'Не удалось сохранить ответ')
    })
  }

  useEffect(() => {
    if (!deck || !mode || words.length === 0 || index < words.length || recorded.current) return
    recorded.current = true
    for (const lemma of openMisses.current) post(lemma, false)
    const elapsed = Math.max(1, Math.round((Date.now() - started.current) / 60000))
    void recordStudy(elapsed).catch(() => undefined)
    if (!missed.current && lockAt.current && lockAt.current > Date.now()) {
      const iso = new Date(lockAt.current).toISOString()
      window.localStorage.setItem('paralbook.studyLock', iso)
      setLockUntil(iso)
      return
    }
    if (missed.current) {
      window.localStorage.removeItem('paralbook.studyLock')
      setLockUntil(null)
    }
  }, [deck, index, mode, words])

  function expireLock() {
    window.localStorage.removeItem('paralbook.studyLock')
    lockAt.current = null
    setLockUntil(null)
    setIndex(0)
    setError('')
    setDeck(null)
    setReplay(null)
    const dailyCount = Number(search.get('daily')) || readDailyNew()
    studyDeck(packs, mode, dailyCount)
      .then((next) => {
        setDeck(next)
        if (mode === 'review' && next.lemmas.length === 0 && next.nextDueAt && new Date(next.nextDueAt).getTime() > Date.now()) {
          window.localStorage.setItem('paralbook.studyLock', next.nextDueAt)
          setLockUntil(next.nextDueAt)
        }
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'Не удалось собрать колоду')
      })
  }

  const finished = deck && index >= words.length && words.length > 0
  const sessionUntil = finished && !missed.current && lockAt.current && lockAt.current > Date.now() ? new Date(lockAt.current).toISOString() : null
  const reviewLock = mode === 'review' ? sessionUntil || (lockUntil && new Date(lockUntil).getTime() > Date.now() ? lockUntil : null) : null

  function screen(body: ReactNode, counter?: string) {
    return (
      <div>
        <header className="header">
          <button className="back" onClick={() => router.push('/vocabulary')} aria-label="Назад">
            <ArrowLeft size={22} />
          </button>
          <div className="grow">Изучение</div>
          {counter ? <span>{counter}</span> : <span style={{ width: 24 }} />}
        </header>
        <div className={styles.modes}>
          {MODES.map(([id, label]) => (
            <button key={id} className={mode === id ? 'chip on' : 'chip'} onClick={() => switchMode(id)}>
              {label}
            </button>
          ))}
        </div>
        {body}
      </div>
    )
  }

  if (error) {
    return screen(
      <div className="empty">
        <h2>Изучение не началось</h2>
        <p>{error}</p>
      </div>,
    )
  }

  if (reviewLock) {
    return screen(
      <Wait
        until={reviewLock}
        newToday={deck?.newToday ?? 0}
        onLater={() => router.push('/vocabulary')}
        onExpire={expireLock}
      />,
    )
  }

  if (deck && deck.lemmas.length === 0) {
    return screen(
      <div className="empty">
        <h2>Слов нет</h2>
        <p>В выбранных пачках нет новых слов, и сейчас нечего повторять.</p>
      </div>,
    )
  }

  if (finished) {
    return screen(
      <div className="empty">
        <h2>Пока всё</h2>
        <p>{missed.current ? 'Слова, на которые нажали «Не знаю», можно повторить сразу.' : 'Карточки этой пачки пройдены.'}</p>
      </div>,
    )
  }

  if (!card || !deck) return screen(<p className="loading">Загрузка…</p>)

  const reviewLabel = mode === 'review' || (mode === 'mixed' && card.review > 0) ? `Повтор ${Math.min(6, card.review + 1)}` : null

  return screen(
    <>
      <div className={styles.deck}>
        <div key={index} className={leave ? `${styles.flipper} ${leave === 'no' ? styles.leaveNo : styles.leaveYes}` : `${styles.flipper} ${styles.enter}`}>
          <WordCard
            card={card}
            flipped={flipped}
            showTranslation={translation}
            hintSeen={hintSeen}
            reviewLabel={reviewLabel}
            onHint={() => setFlipped(true)}
            onTranslation={() => setTranslation(true)}
            onBack={() => {
              setFlipped(false)
              setHintSeen(true)
            }}
          />
        </div>
      </div>
      <div className="actions pad">
        <button className="btn no" disabled={leave !== null} onClick={() => answer(false)}>
          <ArrowLeft size={16} />
          Не знаю
        </button>
        <button className="btn yes" disabled={leave !== null} onClick={() => answer(true)}>
          Знаю
          <ArrowRight size={16} />
        </button>
      </div>
    </>,
    `${index + 1}/${words.length}`,
  )
}

function minutesLeft(until: string) {
  const time = new Date(until).getTime()
  if (!Number.isFinite(time)) return 0
  return Math.max(0, Math.ceil((time - Date.now()) / 60000))
}

function useMinuteCountdown(until: string) {
  const [left, setLeft] = useState(() => minutesLeft(until))
  useEffect(() => {
    const tick = () => {
      const next = minutesLeft(until)
      setLeft((current) => (current === next ? current : next))
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [until])
  return left
}

function Wait({
  until,
  newToday,
  onLater,
  onExpire,
}: {
  until: string
  newToday: number
  onLater: () => void
  onExpire: () => void
}) {
  const left = useMinuteCountdown(until)
  const expire = useRef(onExpire)
  expire.current = onExpire
  useEffect(() => {
    if (left === 0) expire.current()
  }, [left])
  return (
    <div className="pad stack">
      <h2 style={{ margin: 0, textAlign: 'center' }}>Рано повторять</h2>
      <p style={{ textAlign: 'center' }}>Следующие слова откроются через {left} мин.</p>
      <p className="muted" style={{ textAlign: 'center' }}>Сегодня новых слов: {newToday}.</p>
      <button className="btn ghost" onClick={onLater}>
        Вернуться позже
      </button>
    </div>
  )
}

