'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Copy, Trophy } from 'lucide-react'
import selectFriends from '@/actions/Friends/selectFriends'
import { useAuth, useUi } from '@/contexts/AuthContext'
import { type Friend, type WeekActivity } from '@/sorse/types'
import dayWord from '@/sorse/dayWord'
import friendStyles from '@/components/FriendCard/FriendCard.module.css'
import styles from './page.module.css'

const GOAL_MINUTES = 120
const GOAL_WORDS = 40
const CELEBRATED_KEY = 'paralbook.pairGoal.v1'

function percent(value: number, target: number) {
  return Math.min(100, Math.round((value / Math.max(1, target)) * 100))
}

function weekKey() {
  const date = new Date()
  const offset = (date.getDay() + 6) % 7
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset)
  const year = monday.getFullYear()
  const month = String(monday.getMonth() + 1).padStart(2, '0')
  const day = String(monday.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function celebratedKey(owner?: string) {
  return `${CELEBRATED_KEY}:${owner || 'anonymous'}`
}

function readCelebrated(owner?: string): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(celebratedKey(owner))
    return raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function writeCelebrated(value: Record<string, string>, owner?: string) {
  try {
    window.localStorage.setItem(celebratedKey(owner), JSON.stringify(value))
  } catch {
    // localStorage может быть недоступен
  }
}

export default function Page() {
  const router = useRouter()
  const { user } = useAuth()
  const { notify } = useUi()
  const [items, setItems] = useState<Friend[]>([])
  const [me, setMe] = useState<WeekActivity>({ minutes: 0, words: 0, days: 0 })
  const [loaded, setLoaded] = useState(false)
  const [celebration, setCelebration] = useState<{ friend: Friend; minutes: number; words: number } | null>(null)

  useEffect(() => {
    let active = true
    selectFriends()
      .then((data) => {
        if (!active) return
        setItems(data.items)
        setMe(data.me)
      })
      .catch((reason: unknown) => {
        if (active) notify(reason instanceof Error ? reason.message : 'Не удалось загрузить друзей')
      })
      .finally(() => {
        if (active) setLoaded(true)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!loaded || !items.length) return
    const week = weekKey()
    const seen = readCelebrated(user?.id)
    for (const friend of items) {
      if (!friend.showMinutes || seen[friend.id] === week) continue
      const minutes = me.minutes + friend.weekMinutes
      const words = me.words + friend.weekWords
      if (minutes < GOAL_MINUTES || words < GOAL_WORDS) continue
      writeCelebrated({ ...seen, [friend.id]: week }, user?.id)
      setCelebration({ friend, minutes, words })
      break
    }
  }, [loaded, items, me, user?.id])

  async function copyCode() {
    if (!user?.friendCode) return
    try {
      await navigator.clipboard.writeText(user.friendCode)
      notify('Код скопирован')
    } catch {
      notify('Не удалось скопировать код')
    }
  }

  const leaders = [
    { id: 'me', name: 'Вы', minutes: me.minutes as number | null, words: me.words, days: me.days, mine: true },
    ...items.map((friend) => ({
      id: friend.id,
      name: friend.name,
      minutes: (friend.showMinutes ? friend.weekMinutes : null) as number | null,
      words: friend.weekWords,
      days: friend.weekDays,
      mine: false,
    })),
  ].sort((left, right) => (right.minutes ?? -1) - (left.minutes ?? -1) || right.words - left.words)

  const max = Math.max(1, ...leaders.map((item) => item.minutes ?? 0))

  return (
    <div>
      <header className="header">
        <button className="back" onClick={() => router.back()} aria-label="Назад">
          <ArrowLeft size={22} />
        </button>
        <h1>Друзья</h1>
      </header>
      <div className="pad stack">
        <article className="card">
          <div className="row">
            <span className="muted small">Ваш код друга</span>
            <button className="btn soft slim" type="button" onClick={() => void copyCode()} disabled={!user?.friendCode}>
              <Copy size={14} />
              Скопировать
            </button>
          </div>
          <div className={styles.code}>{user?.friendCode ?? '—'}</div>
          <p className="small muted" style={{ margin: 0 }}>
            Передайте код другу. Чтобы гонка была взаимной, он должен добавить вас по этому коду.
          </p>
        </article>

        {!loaded ? <p className="loading">Загрузка…</p> : null}

        {loaded ? (
          <section>
            <div className="row">
              <h2 style={{ margin: 0 }}>Гонка недели</h2>
              <Link href="/friends/add" className="link" style={{ width: 'auto' }}>
                Добавить
              </Link>
            </div>
            <p className="small muted">Минуты чтения за последние 7 дней. Кто впереди — тот забирает неделю.</p>
            <div className={styles.race}>
              {leaders.map((item, index) => (
                <div className={item.mine ? `${styles.row} ${styles.me}` : styles.row} key={item.id}>
                  <div className={styles.place}>{index === 0 ? <Trophy size={15} /> : index + 1}</div>
                  <div className={styles.person}>
                    <div className={styles.name}>
                      {item.name}
                      <span className={styles.days}>{item.days} дн.</span>
                    </div>
                    <div className={styles.bar}>
                      <i style={{ width: item.minutes == null ? 0 : `${Math.max(4, Math.round((item.minutes / max) * 100))}%` }} />
                    </div>
                  </div>
                  <div className={styles.value}>
                    <b>{item.minutes ?? '—'}</b>
                    <span>{item.minutes == null ? 'скрыто' : 'мин'}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {loaded && items.length === 0 ? (
          <div className="empty">
            <h2>Пока никого нет</h2>
            <p>Добавьте друга по коду — и появится недельная гонка.</p>
            <Link className="btn" href="/friends/add">
              Добавить друга
            </Link>
          </div>
        ) : null}

        {loaded
          ? items.map((friend) => {
              const minutes = friend.showMinutes ? me.minutes + friend.weekMinutes : null
              const words = me.words + friend.weekWords
              return (
                <article className="card" key={friend.id}>
                  <div className={friendStyles.friend}>
                    <div className={`${friendStyles.avatar} ${friendStyles.lg}`}>{friend.name.slice(0, 1)}</div>
                    <div>
                      <div className={friendStyles.name}>{friend.name}</div>
                      <div className={friendStyles.sub}>{friend.minutesLabel}</div>
                    </div>
                    <div className={friendStyles.streak} data-tip="Серия дней подряд">
                      {friend.streak} {dayWord(friend.streak)}
                      <small>серия</small>
                    </div>
                  </div>
                  <div className={styles.goals}>
                    <div className="row">
                      <span className="muted small">Вместе за неделю</span>
                      <span className="small">{friend.weekDays} дн. активности</span>
                    </div>
                    <Goal label="Минуты" value={minutes} target={GOAL_MINUTES} />
                    <Goal label="Слова" value={words} target={GOAL_WORDS} />
                  </div>
                </article>
              )
            })
          : null}

        {items.length > 0 ? (
          <Link className="btn" href="/friends/add">
            Добавить друга
          </Link>
        ) : null}
      </div>
      {celebration ? (
        <div className="modal-dim" onClick={() => setCelebration(null)}>
          <div
            className={`modal ${styles.celebrate}`}
            role="dialog"
            aria-modal="true"
            aria-label="Парная цель выполнена"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.confetti} aria-hidden="true">
              {Array.from({ length: 18 }, (_, index) => (
                <i
                  key={index}
                  style={{
                    left: `${(index * 37) % 100}%`,
                    animationDelay: `${(index % 6) * 0.12}s`,
                  }}
                />
              ))}
            </div>
            <div className={styles.celebrateIcon}>🎉</div>
            <h2>Цель недели закрыта!</h2>
            <p>
              Вы с {celebration.friend.name} сделали вместе {celebration.minutes} минут и {celebration.words} слов.
            </p>
            <div className={styles.celebrationStats}>
              <span><b>{celebration.minutes}</b> мин</span>
              <span><b>{celebration.words}</b> слов</span>
            </div>
            <button className="btn" onClick={() => setCelebration(null)}>
              Круто!
            </button>
            <p className="small muted">Завтра начнётся новая гонка — возвращайтесь ещё.</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Goal({ label, value, target }: { label: string; value: number | null; target: number }) {
  return (
    <div className={styles.goal}>
      <div className="row">
        <span>{label}</span>
        <b>{value == null ? 'скрыто' : `${value} / ${target}`}</b>
      </div>
      <div className={styles.goalBar}>
        <i style={{ width: value == null ? '0%' : `${percent(value, target)}%` }} />
      </div>
    </div>
  )
}
