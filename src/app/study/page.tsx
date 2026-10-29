'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import practiceWord from '@/actions/Training/practiceWord'
import recordStudy from '@/actions/Training/recordStudy'
import selectStudyCard from '@/actions/Training/selectStudyCard'
import studyDeck, { type StudyDeck } from '@/actions/Training/studyDeck'
import WordCard from '@/components/WordCard/WordCard'
import { useAuth, useUi } from '@/contexts/AuthContext'
import { readDailyNew, writeDailyNew } from '@/sorse/prefs'
import { LEVELS, type SessionCard } from '@/sorse/types'
import styles from '../train/page.module.css'

const PACKS = [
  ['own', 'Свои слова'],
  ['texts', 'Из текстов'],
  ['r100', '1–100'],
  ['r1000', '101–1000'],
  ['r3000', '1001–3000'],
  ...LEVELS.map((level) => [level, level] as const),
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
  const mode = search.get('mode') || ''
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
    if (mode && !extra) {
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
    if (mode) {
      setDeck(null)
      setReplay(null)
    }
    studyDeck(packs, extra ? 'learn' : mode, dailyCount, extra)
      .then((next) => {
        if (!active) return
        setDeck(next)
        if (!extra && mode && next.lemmas.length === 0 && next.nextDueAt && new Date(next.nextDueAt).getTime() > Date.now()) {
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

  function openMode(next: string) {
    writeDailyNew(daily)
    const query = new URLSearchParams({ mode: next, packs: packs.join(','), daily: String(daily) })
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
        if (next.lemmas.length === 0 && next.nextDueAt && new Date(next.nextDueAt).getTime() > Date.now()) {
          window.localStorage.setItem('paralbook.studyLock', next.nextDueAt)
          setLockUntil(next.nextDueAt)
        }
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'Не удалось собрать колоду')
      })
  }

  function addMore(count: number) {
    const next = Math.min(60, Math.max(5, count || 5))
    writeDailyNew(next)
    const query = new URLSearchParams({
      mode: 'learn',
      packs: packs.join(','),
      daily: String(next),
      extra: '1',
    })
    router.push(`/study?${query.toString()}`)
  }

  if (!mode) {
    return (
      <div>
        <header className="header">
          <button className="back" onClick={() => router.push('/vocabulary')} aria-label="Назад">
            <ArrowLeft size={22} />
          </button>
          <div className="grow">Режим</div>
          <span style={{ width: 24 }} />
        </header>
        <div className="pad stack">
          <div className="gap8">
            {PACKS.map(([id, label]) => (
              <button
                key={id}
                className={packs.includes(id) ? 'chip on' : 'chip'}
                onClick={() => setPacks((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))}
              >
                {label}
              </button>
            ))}
          </div>
          <div>
            <div className="row">
              <span>Новых в день</span>
              <span className="muted">{daily}</span>
            </div>
            <input
              type="range"
              min={5}
              max={60}
              value={daily}
              onChange={(event) => {
                const value = Number(event.target.value)
                setDaily(value)
                writeDailyNew(value)
              }}
            />
          </div>
          <button className="btn" onClick={() => openMode('learn')}>
            Учить новые
          </button>
          <button className="btn ghost" onClick={() => openMode('review')}>
            Повторять
          </button>
          <button className="btn ghost" onClick={() => openMode('mixed')}>
            Смешанный
          </button>
          {error ? <p className="form-error">{error}</p> : deck ? <Today deck={deck} /> : <p className="loading">Загрузка…</p>}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="empty">
        <h2>Изучение не началось</h2>
        <p>{error}</p>
        <button className="btn" onClick={() => router.push('/study')}>
          К режимам
        </button>
      </div>
    )
  }

  const finished = deck && index >= words.length && words.length > 0
  const sessionUntil = finished && !missed.current && lockAt.current && lockAt.current > Date.now() ? new Date(lockAt.current).toISOString() : null
  const activeLock = sessionUntil || (lockUntil && new Date(lockUntil).getTime() > Date.now() ? lockUntil : null)
  if (mode && activeLock) {
    return (
      <Wait
        until={activeLock}
        newToday={deck?.newToday ?? 0}
        onLater={() => router.push('/study')}
        onMore={addMore}
        onExpire={expireLock}
      />
    )
  }

  if (deck && deck.lemmas.length === 0) {
    return (
      <div className="empty">
        <h2>Слов нет</h2>
        <p>В выбранных пачках нет новых слов, и сейчас нечего повторять.</p>
        <button className="btn" onClick={() => router.push('/study')}>
          К режимам
        </button>
      </div>
    )
  }

  if (finished) {
    return (
      <div className="empty">
        <h2>Пока всё</h2>
        <p>{missed.current ? 'Слова, на которые нажали «Не знаю», можно повторить сразу.' : 'Карточки этой пачки пройдены.'}</p>
        <button className="btn" onClick={() => router.push('/study')}>
          К режимам
        </button>
      </div>
    )
  }

  if (!card || !deck) return <p className="loading">Загрузка…</p>

  const reviewLabel = mode === 'review' || (mode === 'mixed' && card.review > 0) ? `Повтор ${Math.min(6, card.review + 1)}` : null

  return (
    <div>
      <header className="header">
        <button className="back" onClick={() => router.push('/study')} aria-label="Назад">
          <ArrowLeft size={22} />
        </button>
        <div className="grow">{mode === 'learn' ? 'Новые' : mode === 'mixed' ? 'Смешанный' : 'Повтор'}</div>
        <span>
          {index + 1}/{words.length}
        </span>
      </header>
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
  onMore,
  onExpire,
}: {
  until: string
  newToday: number
  onLater: () => void
  onMore: (count: number) => void
  onExpire: () => void
}) {
  const left = useMinuteCountdown(until)
  const [count, setCount] = useState(10)
  const expire = useRef(onExpire)
  expire.current = onExpire
  useEffect(() => {
    setCount(readDailyNew())
  }, [])
  useEffect(() => {
    if (left === 0) expire.current()
  }, [left])
  return (
    <div className="pad stack">
      <header className="header">
        <button className="back" onClick={onLater} aria-label="Назад">
          <ArrowLeft size={22} />
        </button>
        <div className="grow">Повтор</div>
        <span style={{ width: 24 }} />
      </header>
      <h2 style={{ margin: 0, textAlign: 'center' }}>Рано повторять</h2>
      <p style={{ textAlign: 'center' }}>Следующие слова откроются через {left} мин.</p>
      <p className="muted" style={{ textAlign: 'center' }}>Сегодня новых слов: {newToday}.</p>
      <label className="stack">
        <span>Сколько новых слов</span>
        <input
          className="input"
          type="number"
          min={5}
          max={60}
          value={count}
          onChange={(event) => setCount(Number(event.target.value))}
        />
      </label>
      <button className="btn" onClick={() => onMore(count)}>
        Ещё новых слов
      </button>
      <button className="btn ghost" onClick={onLater}>
        Вернуться позже
      </button>
    </div>
  )
}

function Today({ deck }: { deck: StudyDeck }) {
  return (
    <div className="stack">
      <strong>Серия {deck.streak} дн.</strong>
      <div className={styles.metrics} style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <div className={styles.metric}>
          <b>{deck.today.new}</b>
          <span className="muted">новые</span>
        </div>
        <div className={styles.metric}>
          <b>{deck.today.reviewed}</b>
          <span className="muted">повторённые</span>
        </div>
        <div className={styles.metric}>
          <b>{deck.today.mastered}</b>
          <span className="muted">выученные</span>
        </div>
        <div className={styles.metric} style={{ gridColumn: 2 }}>
          <b>{deck.today.known}</b>
          <span className="muted">уже известные</span>
        </div>
      </div>
    </div>
  )
}
