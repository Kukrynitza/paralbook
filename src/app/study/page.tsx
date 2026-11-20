'use client'

import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import practiceWord from '@/actions/Training/practiceWord'
import recordStudy from '@/actions/Training/recordStudy'
import selectStudyCard from '@/actions/Training/selectStudyCard'
import studyDeck, { type StudyDeck } from '@/actions/Training/studyDeck'
import ConfirmDialog from '@/components/ConfirmDialog/ConfirmDialog'
import WordCard from '@/components/WordCard/WordCard'
import { useAuth, useUi } from '@/contexts/AuthContext'
import { addExtra, markCompleted, markReviewed, markTarget, readDayState, remainingNew } from '@/sorse/daily'
import { readDailyNew } from '@/sorse/prefs'
import { type SessionCard } from '@/sorse/types'
import styles from './page.module.css'

const MODES = [
  ['learn', 'Новые'],
  ['mixed', 'Смешанное'],
  ['review', 'Повторение'],
] as const

type Phase = 'collect' | 'repeat' | 'review' | 'done'

function interleave(newItems: string[], dueItems: Iterable<string>) {
  const fresh = newItems.slice()
  const due = [...dueItems]
  const result: string[] = []
  let left = 0
  let right = 0
  while (left < fresh.length || right < due.length) {
    if (left < fresh.length) result.push(fresh[left++])
    if (right < due.length) result.push(due[right++])
  }
  return result
}

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
  const owner = user?.id
  const mode = search.get('mode') || 'mixed'
  const extra = search.get('extra') === '1'
  const kind = extra ? 'learn' : mode
  const [packs, setPacks] = useState<string[]>(() => (search.get('packs') || '').split(',').filter(Boolean))
  const [daily, setDaily] = useState(10)
  const [plan, setPlan] = useState(10)
  const [targets, setTargets] = useState<string[]>([])
  const [completed, setCompleted] = useState<string[]>([])
  const [phase, setPhase] = useState<Phase>('collect')
  const [queue, setQueue] = useState<string[]>([])
  const [index, setIndex] = useState(0)
  const [deck, setDeck] = useState<StudyDeck | null>(null)
  const [reviewDone, setReviewDone] = useState(0)
  const [reviewTotal, setReviewTotal] = useState(0)
  const [card, setCard] = useState<SessionCard | null>(null)
  const [flipped, setFlipped] = useState(false)
  const [translation, setTranslation] = useState(false)
  const [hintSeen, setHintSeen] = useState(false)
  const [error, setError] = useState('')
  const [leave, setLeave] = useState<'no' | 'yes' | null>(null)
  const [reload, setReload] = useState(0)
  const [moreOpen, setMoreOpen] = useState(false)
  const [moreCount, setMoreCount] = useState(10)
  const dueSet = useRef(new Set<string>())
  const cache = useRef(new Map<string, SessionCard>())
  const posted = useRef(new Map<string, boolean>())
  const pending = useRef(new Map<string, Promise<void>>())
  const started = useRef(Date.now())
  const recorded = useRef(false)
  const words = queue

  useEffect(() => {
    if (!user) return
    setPacks((current) => (current.length ? current : ['own', user.cefr]))
  }, [user])

  useEffect(() => {
    let active = true
    setError('')
    setCard(null)
    setIndex(0)
    setQueue([])
    dueSet.current.clear()
    setReviewDone(0)
    setReviewTotal(0)
    setPhase('collect')
    setDeck(null)
    setLeave(null)
    cache.current.clear()
    posted.current.clear()
    started.current = Date.now()
    recorded.current = false
    const base = Number(search.get('daily')) || readDailyNew(owner)
    const day = readDayState(owner)
    const nextPlan = base + day.extra
    const budget = kind === 'review' ? 0 : remainingNew(base, day)
    setDaily(base)
    setPlan(nextPlan)
    setTargets(day.targets)
    setCompleted(day.completed)
    const pendingTargets = day.targets.filter((lemma) => !day.completed.includes(lemma))
    const load = (next: StudyDeck) => {
      if (!active) return
      setDeck(next)
      const due = kind === 'mixed'
        ? next.due.filter((lemma) => !pendingTargets.includes(lemma))
        : kind === 'review'
          ? next.due
          : []
      dueSet.current = new Set(due)
      const startReview = day.reviewed.length
      if (kind === 'review') {
        const total = startReview + next.due.length
        setReviewDone(startReview)
        setReviewTotal(total)
        setQueue(due)
        setPhase(due.length ? 'review' : 'done')
        return
      }
      if (kind === 'mixed') {
        const remaining = Math.max(0, nextPlan - day.completed.length)
        const total = startReview + next.due.length + remaining
        setReviewDone(startReview)
        setReviewTotal(total)
      }
      if (pendingTargets.length) {
        setQueue(kind === 'mixed' ? interleave(pendingTargets, due) : pendingTargets)
        setPhase('repeat')
        return
      }
      if (budget > 0) {
        if (next.fresh.length) {
          setQueue(kind === 'mixed' ? interleave(next.fresh, due) : next.fresh)
          setPhase('collect')
          return
        }
        if (kind === 'mixed' && due.length) {
          setQueue(due)
          setPhase('collect')
          return
        }
      }
      if (kind === 'mixed' && due.length) {
        setQueue(due)
        setPhase('review')
        return
      }
      setPhase('done')
    }
    const request = kind === 'review'
      ? studyDeck(packs, 'review', 0)
      : studyDeck(packs, kind === 'mixed' ? 'mixed' : 'learn', budget)
    request
      .then(load)
      .catch((reason: unknown) => {
        if (!active) return
        const message = reason instanceof Error ? reason.message : 'Не удалось собрать колоду'
        notify(message)
        setError(message)
      })
    return () => {
      active = false
    }
  }, [kind, packs, search, notify, reload, owner])

  useEffect(() => {
    const lemma = words[index]
    if (!lemma) {
      setCard(null)
      return
    }
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
    return () => {
      active = false
    }
  }, [words, index])

  useEffect(() => {
    if (phase !== 'done' || recorded.current) return
    recorded.current = true
    const elapsed = Math.max(1, Math.round((Date.now() - started.current) / 60000))
    void recordStudy(elapsed).catch(() => undefined)
  }, [phase])

  async function switchMode(next: string) {
    if (next === mode) return
    await Promise.allSettled([...pending.current.values()])
    const query = new URLSearchParams({
      mode: next,
      packs: packs.join(','),
      daily: search.get('daily') || String(daily),
    })
    router.push(`/study?${query.toString()}`)
  }

  function post(lemma: string, remembered: boolean) {
    if (posted.current.get(lemma) === remembered) return
    posted.current.set(lemma, remembered)
    const previous = pending.current.get(lemma) ?? Promise.resolve()
    const task = previous
      .catch(() => undefined)
      .then(() => practiceWord(lemma, remembered))
      .catch((reason: unknown) => {
        if (posted.current.get(lemma) === remembered) posted.current.delete(lemma)
        notify(reason instanceof Error ? reason.message : 'Не удалось сохранить ответ')
      })
    pending.current.set(lemma, task)
    void task.finally(() => {
      if (pending.current.get(lemma) === task) pending.current.delete(lemma)
    })
  }

  function resetCardView() {
    setLeave(null)
    setFlipped(false)
    setTranslation(false)
    setCard(null)
  }

  async function loadMoreFresh() {
    const day = readDayState(owner)
    const budget = remainingNew(daily, day)
    if (budget <= 0) return false
    const next = await studyDeck(packs, 'learn', budget)
    setDeck(next)
    if (!next.fresh.length) return false
    resetCardView()
    setQueue(kind === 'mixed' ? interleave(next.fresh, dueSet.current) : next.fresh)
    setIndex(0)
    setPhase('collect')
    return true
  }

  async function finishCollect(lastLemma?: string) {
    await Promise.allSettled([...pending.current.values()])
    const day = readDayState(owner)
    setTargets(day.targets)
    setCompleted(day.completed)
    const pendingTargets = day.targets.filter((lemma) => !day.completed.includes(lemma))
    const ordered = lastLemma && pendingTargets.length > 1 && pendingTargets.includes(lastLemma)
      ? [...pendingTargets.filter((lemma) => lemma !== lastLemma), lastLemma]
      : pendingTargets
    const due = [...dueSet.current]
    const budget = remainingNew(daily, day)
    resetCardView()
    if (ordered.length) {
      setQueue(kind === 'mixed' ? interleave(ordered, due) : ordered)
      setIndex(0)
      setPhase('repeat')
      return
    }
    if (budget > 0 && deck?.hasMoreFresh && await loadMoreFresh()) return
    if (kind === 'mixed' && due.length) {
      setQueue(due)
      setIndex(0)
      setPhase('review')
      return
    }
    setQueue([])
    setPhase('done')
  }

  async function finishRepeat() {
    await Promise.allSettled([...pending.current.values()])
    const day = readDayState(owner)
    setTargets(day.targets)
    setCompleted(day.completed)
    const pendingTargets = day.targets.filter((lemma) => !day.completed.includes(lemma))
    const due = [...dueSet.current]
    const budget = remainingNew(daily, day)
    resetCardView()
    if (pendingTargets.length) {
      setQueue(kind === 'mixed' ? interleave(pendingTargets, due) : pendingTargets)
      setIndex(0)
      setPhase('repeat')
      return
    }
    if (budget > 0 && deck?.hasMoreFresh && await loadMoreFresh()) return
    if (kind === 'mixed' && due.length) {
      setQueue(due)
      setIndex(0)
      setPhase('review')
      return
    }
    setQueue([])
    setPhase('done')
  }

  async function finishReview() {
    resetCardView()
    setQueue([])
    await Promise.allSettled([...pending.current.values()])
    if (kind !== 'review') {
      setPhase('done')
      return
    }
    try {
      const next = await studyDeck(packs, 'review', 0)
      setDeck(next)
      const day = readDayState(owner)
      const startReview = day.reviewed.length
      setReviewDone(startReview)
      setReviewTotal(startReview + next.due.length)
      if (next.due.length) {
        dueSet.current = new Set(next.due)
        setQueue(next.due)
        setIndex(0)
        setPhase('review')
        return
      }
    } catch {
      setReload((value) => value + 1)
      return
    }
    setPhase('done')
  }

  function answer(remembered: boolean) {
    if (!card || leave || phase === 'done') return
    const lemma = card.lemma
    const atIndex = index
    const currentPhase = phase
    const isDue = dueSet.current.has(lemma)
    const isNew = !isDue && (currentPhase === 'collect' || currentPhase === 'repeat')
    if (remembered) {
      if (isDue || kind === 'mixed') {
        const next = markReviewed(lemma, owner)
        setReviewDone(next.reviewed.length)
      }
      if (isNew) {
        const next = markCompleted(lemma, owner)
        setCompleted(next.completed)
      }
      if (isDue) dueSet.current.delete(lemma)
      post(lemma, true)
    } else {
      if (currentPhase === 'collect' && !isDue) {
        const next = markTarget(lemma, owner)
        setTargets(next.targets)
      }
      post(lemma, false)
    }
    setLeave(remembered ? 'yes' : 'no')
    const motion = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.setTimeout(() => {
      if (!remembered && (isDue || currentPhase === 'repeat' || currentPhase === 'review')) {
        const rest = words.slice(atIndex + 1)
        setQueue([...rest, lemma])
        setIndex(0)
        setLeave(null)
        return
      }
      if (currentPhase === 'collect') {
        const day = readDayState(owner)
        if (!isDue && remainingNew(daily, day) <= 0) {
          const pendingTargets = day.targets.filter((item) => !day.completed.includes(item))
          const ordered = pendingTargets.length > 1 && pendingTargets.includes(lemma)
            ? [...pendingTargets.filter((item) => item !== lemma), lemma]
            : pendingTargets
          resetCardView()
          setQueue(kind === 'mixed' ? interleave(ordered, dueSet.current) : ordered)
          setIndex(0)
          setPhase('repeat')
          return
        }
        const nextIndex = atIndex + 1
        if (nextIndex < words.length) {
          setIndex(nextIndex)
          setLeave(null)
          return
        }
        void finishCollect(lemma)
        return
      }
      const nextIndex = atIndex + 1
      if (nextIndex < words.length) {
        setIndex(nextIndex)
        setLeave(null)
        return
      }
      if (currentPhase === 'repeat') {
        void finishRepeat()
        return
      }
      void finishReview()
    }, motion ? 480 : 0)
  }

  function confirmMore() {
    addExtra(moreCount, owner)
    setMoreOpen(false)
    setReload((value) => value + 1)
  }

  function moreDialog() {
    return (
      <ConfirmDialog
        open={moreOpen}
        title="Добавить ещё новых слов?"
        confirmLabel="Добавить"
        onClose={() => setMoreOpen(false)}
        onConfirm={confirmMore}
      >
        <p>Сколько новых слов добавить сверх лимита на сегодня?</p>
        <div className="gap8">
          {[5, 10, 15, 20].map((value) => (
            <button
              key={value}
              type="button"
              className={moreCount === value ? 'chip on' : 'chip'}
              onClick={() => setMoreCount(value)}
            >
              +{value}
            </button>
          ))}
        </div>
        <label className="field" style={{ marginTop: 12 }}>
          <span>Своё количество</span>
          <input
            className="input compact"
            type="number"
            min={1}
            max={60}
            value={moreCount}
            onChange={(event) => setMoreCount(Math.max(1, Math.min(60, Number(event.target.value) || 1)))}
          />
        </label>
      </ConfirmDialog>
    )
  }

  const reviewLock = kind === 'review' && phase === 'done' && deck?.nextDueAt && new Date(deck.nextDueAt).getTime() > Date.now()
    ? deck.nextDueAt
    : null

  function screen(body: ReactNode, counter?: string) {
    return (
      <div className={styles.screen}>
        <header className="header">
          <button className="back" onClick={() => router.push('/vocabulary')} aria-label="Назад">
            <ArrowLeft size={22} />
          </button>
          <div className="grow">Изучение</div>
          {counter ? <span>{counter}</span> : <span style={{ width: 24 }} />}
        </header>
        <div className={styles.modes}>
          {MODES.map(([id, label]) => (
            <button
              key={id}
              className={mode === id ? 'chip on' : 'chip'}
              data-tip={id === 'learn' ? 'Только новые слова' : id === 'review' ? 'Только повторение' : 'Новые и повторение вместе'}
              onClick={() => void switchMode(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {body}
        {moreDialog()}
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
        newToday={completed.length}
        onLater={() => router.push('/vocabulary')}
        onExpire={() => setReload((value) => value + 1)}
      />,
    )
  }

  if (phase === 'done' || (!words.length && phase !== 'collect' && phase !== 'review')) {
    return screen(
      <StudyDone
        mode={kind}
        plan={plan}
        completed={completed.length}
        reviewDone={reviewDone}
        reviewTotal={reviewTotal}
        nextMinutes={deck?.nextMinutes ?? null}
        onMore={() => {
          setMoreCount(10)
          setMoreOpen(true)
        }}
        onReview={() => void switchMode('review')}
        onLearn={() => void switchMode('learn')}
        onVocabulary={() => router.push('/vocabulary')}
      />,
      kind === 'learn' ? `${completed.length}/${plan}` : `${reviewDone}/${reviewTotal}`,
    )
  }

  if (!card || !words.length) return screen(<p className="loading">Загрузка…</p>)

  const reviewLabel = phase === 'repeat'
    ? 'Повтор нового'
    : phase === 'review' || (kind === 'mixed' && card.review > 0)
      ? `Повтор ${Math.min(6, card.review + 1)}`
      : null
  const counter = kind === 'learn' ? `${completed.length}/${plan}` : `${reviewDone}/${reviewTotal}`

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
    counter,
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

function StudyDone({
  mode,
  plan,
  completed,
  reviewDone,
  reviewTotal,
  nextMinutes,
  onMore,
  onReview,
  onLearn,
  onVocabulary,
}: {
  mode: string
  plan: number
  completed: number
  reviewDone: number
  reviewTotal: number
  nextMinutes: number | null
  onMore: () => void
  onReview: () => void
  onLearn: () => void
  onVocabulary: () => void
}) {
  const review = mode === 'review'
  const mixed = mode === 'mixed'
  const full = !review && completed >= plan
  const title = review
    ? 'Повторение на сегодня закончено'
    : mixed
      ? 'Смешанное пройдено'
      : full
        ? 'План новых слов выполнен'
        : 'Пока всё'
  const text = review
    ? `Повторено: ${reviewDone}/${reviewTotal}.`
    : mixed
      ? `Пройдено: ${reviewDone}/${reviewTotal}. Новых слов: ${completed}/${plan}.`
      : full
        ? `Вы прошли новые слова: ${completed}/${plan}. Они добавлены в повторение.`
        : `Новых слов: ${completed}/${plan}. В выбранных пачках больше нет новых кандидатов.`
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p>{text}</p>
      {nextMinutes !== null ? <p className="small muted">Следующее повторение примерно через {nextMinutes} мин.</p> : null}
      <div className="actions" style={{ width: '100%' }}>
        <button className="btn" onClick={onMore}>
          Добавить ещё новых
        </button>
        {review ? (
          <button className="btn ghost" onClick={onLearn}>
            Новые слова
          </button>
        ) : (
          <button className="btn ghost" onClick={onReview}>
            Повторение
          </button>
        )}
        <button className="btn ghost" onClick={onVocabulary}>
          В словарь
        </button>
      </div>
    </div>
  )
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
  useEffect(() => {
    const sync = () => {
      if (minutesLeft(until) === 0) expire.current()
    }
    window.addEventListener('focus', sync)
    document.addEventListener('visibilitychange', sync)
    return () => {
      window.removeEventListener('focus', sync)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [until])
  return (
    <div className="pad stack">
      <h2 style={{ margin: 0, textAlign: 'center' }}>Рано повторять</h2>
      <p style={{ textAlign: 'center' }}>Следующие слова откроются через {left} мин.</p>
      <p className="muted" style={{ textAlign: 'center' }}>Новых слов за сегодня: {newToday}.</p>
      <button className="btn ghost" onClick={onLater}>
        Вернуться позже
      </button>
    </div>
  )
}
