'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Pin, Settings } from 'lucide-react'
import pinCollection from '@/actions/Collection/pinCollection'
import publishCollection from '@/actions/Collection/publishCollection'
import removeFromCollection from '@/actions/Collection/removeFromCollection'
import selectCollection from '@/actions/Collection/selectCollection'
import selectToday from '@/actions/Collection/selectToday'
import deleteText from '@/actions/Reading/deleteText'
import voteLibrary from '@/actions/Library/voteLibrary'
import { type CollectionItem, type PageResult, type Today } from '@/sorse/types'
import { useUi } from '@/contexts/AuthContext'
import Pager from '@/components/Pager/Pager'
import Ring from '@/components/Ring/Ring'
import Stars from '@/components/Stars/Stars'
import dayWord from '@/sorse/dayWord'
import friendStyles from '@/components/FriendCard/FriendCard.module.css'
import styles from './page.module.css'

const sorts = [
  { id: 'new', label: 'Новые' },
  { id: 'progress', label: 'Прогресс' },
  { id: 'length', label: 'Длина' },
]

export default function Page() {
  const { confirm, notify } = useUi()
  const [sort, setSort] = useState('new')
  const [page, setPage] = useState(1)
  const [today, setToday] = useState<Today | null>(null)
  const [list, setList] = useState<PageResult<CollectionItem> | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    selectToday()
      .then((value) => active && setToday(value))
      .catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : 'Не удалось загрузить'))
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    selectCollection(sort, page)
      .then((value) => active && setList(value))
      .catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : 'Не удалось загрузить'))
    return () => {
      active = false
    }
  }, [page, sort])

  async function remove(item: CollectionItem) {
    const ok = await confirm(item.source === 'chat' && !item.published ? 'Удалить текст?' : 'Убрать текст из подборки?')
    if (!ok) return
    if (item.source === 'chat' && !item.published) await deleteText(item.textId)
    else await removeFromCollection(item.id)
    setList(await selectCollection(sort, page))
    notify('Сохранено')
  }

  async function vote(item: CollectionItem, value: number) {
    try {
      const next = await voteLibrary(item.textId, value)
      setList((current) =>
        current
          ? {
              ...current,
              items: current.items.map((entry) =>
                entry.textId === item.textId ? { ...entry, rating: next.rating, score: next.score } : entry,
              ),
            }
          : current,
      )
    } catch (reason: unknown) {
      notify(reason instanceof Error ? reason.message : 'Не удалось сохранить оценку')
    }
  }

  async function pin(item: CollectionItem) {
    try {
      await pinCollection(item.id)
      setList(await selectCollection(sort, page))
    } catch (reason: unknown) {
      notify(reason instanceof Error ? reason.message : 'Не удалось закрепить')
    }
  }

  async function publish(item: CollectionItem) {
    await publishCollection(item.id)
    setList(await selectCollection(sort, page))
    notify('Текст опубликован')
  }

  return (
    <div>
      <header className="header">
        <h1>Подборка</h1>
        <Link href="/settings" className="icon-btn" aria-label="Настройки">
          <Settings size={20} />
        </Link>
      </header>
      {error ? <p className="form-error pad">{error}</p> : null}
      {today ? (
        <section className={styles.section}>
          <div className="row">
            <h2>Сегодня</h2>
            <Link href="/stats" className="chip">
              Статистика
            </Link>
          </div>
          <div className={styles.rings}>
            <div className={styles.ringCard}>
              <div className={styles.top}>
                <span>Чтение</span>
                <span>мин</span>
              </div>
              <Ring value={today.readingMin} max={today.goalMin || 1} center={String(today.readingMin)} />
              <div className={styles.cap}>{today.readingMin} мин</div>
            </div>
            <div className={styles.ringCard}>
              <div className={styles.top}>
                <span>Слова</span>
                <span>шт</span>
              </div>
              <Ring value={today.words} max={10} center={String(today.words)} />
              <div className={styles.cap}>{today.words} слов</div>
            </div>
            <div className={styles.ringCard}>
              <div className={styles.top}>
                <span>Цель дня</span>
              </div>
              <Ring value={today.readingMin} max={today.goalMin || 1} center={`${today.readingMin}/${today.goalMin}`} />
              <div className={styles.cap}>
                {today.readingMin}/{today.goalMin}
              </div>
            </div>
          </div>
        </section>
      ) : null}
      <section className={styles.section}>
        <div className="row">
          <h2>Друзья сегодня</h2>
          <Link href="/friends" className="link" style={{ width: 'auto' }}>
            Все
          </Link>
        </div>
        {today?.friends.map((friend) => (
          <div className={friendStyles.friend} key={friend.id}>
            <div className={friendStyles.avatar}>{friend.name.slice(0, 1)}</div>
            <div>
              <div className={friendStyles.name}>{friend.name}</div>
              <div className={friendStyles.sub}>{friend.minutesLabel}</div>
            </div>
            <div className={friendStyles.streak}>
              {friend.streak} {dayWord(friend.streak)}
              <small>серия</small>
            </div>
          </div>
        ))}
      </section>
      <div className="sort">
        <span className="label">Сортировка:</span>
        {sorts.map((item) => (
          <button
            key={item.id}
            className={sort === item.id ? 'chip on' : 'chip'}
            onClick={() => {
              setSort(item.id)
              setPage(1)
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {list && list.total === 0 ? (
        <div className="empty">
          <h2>В подборке пока пусто</h2>
          <p>Сгенерируйте текст в чате или добавьте его из библиотеки.</p>
          <Link className="btn" href="/chat">
            Перейти в чат
          </Link>
        </div>
      ) : (
        <div className="list">
          {list?.items.map((item) => (
            <article className="card" key={item.id}>
              <div className="row">
                <span className="badge">{item.source === 'chat' && !item.published ? 'Создано в чате' : 'Библиотека'}</span>
                <button
                  type="button"
                  className={item.pinned ? styles.pinOn : styles.pin}
                  onClick={() => pin(item)}
                >
                  <Pin size={16} fill={item.pinned ? 'currentColor' : 'none'} />
                </button>
              </div>
              <h3>
                <Link href={`/read/${item.textId}`}>{item.title}</Link>
              </h3>
              <p className={styles.excerpt}>{item.excerpt}</p>
              <div className="meta">
                <Stars average={item.rating} mine={item.score} onPick={(value) => vote(item, value)} />
                <span>{(item.progress * 100).toFixed(2)}%</span>
                <span>{item.minutes} мин · {item.level}</span>
                <span>{item.topic}</span>
              </div>
              {item.source === 'chat' && !item.published ? (
                <div className="actions">
                  <button className="btn ghost wrap" onClick={() => publish(item)}>
                    Опубликовать в библиотеку
                  </button>
                  <button className="btn danger slim" onClick={() => remove(item)}>
                    Удалить
                  </button>
                </div>
              ) : (
                <div className="actions">
                  <button className="btn ghost slim" onClick={() => remove(item)}>
                    Убрать из подборки
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {list && list.total > 0 ? <Pager page={list.page} pages={list.pages} onPage={setPage} /> : null}
    </div>
  )
}
