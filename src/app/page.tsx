'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Pin, Plus, Settings } from 'lucide-react'
import pinCollection from '@/actions/Collection/pinCollection'
import publishCollection from '@/actions/Collection/publishCollection'
import removeFromCollection from '@/actions/Collection/removeFromCollection'
import selectCollection from '@/actions/Collection/selectCollection'
import selectToday from '@/actions/Collection/selectToday'
import deleteText from '@/actions/Reading/deleteText'
import voteLibrary from '@/actions/Library/voteLibrary'
import { type CollectionItem, type PageResult, type Today } from '@/sorse/types'
import { useAuth, useUi } from '@/contexts/AuthContext'
import { useJobs } from '@/contexts/JobContext'
import ConfirmDialog from '@/components/ConfirmDialog/ConfirmDialog'
import PublishedBadge from '@/components/PublishedBadge/PublishedBadge'
import Pager from '@/components/Pager/Pager'
import Ring from '@/components/Ring/Ring'
import Stars from '@/components/Stars/Stars'
import dayWord from '@/sorse/dayWord'
import { clearResume, readResume, type ResumeEntry } from '@/sorse/resume'
import friendStyles from '@/components/FriendCard/FriendCard.module.css'
import styles from './page.module.css'

const sorts = [
  { id: 'new', label: 'Новые' },
  { id: 'progress', label: 'Прогресс' },
  { id: 'length', label: 'Длина' },
]

export default function Page() {
  const { confirm, notify, notifyError } = useUi()
  const { user } = useAuth()
  const owner = user?.id
  const { revision } = useJobs()
  const [sort, setSort] = useState('new')
  const [page, setPage] = useState(1)
  const [today, setToday] = useState<Today | null>(null)
  const [list, setList] = useState<PageResult<CollectionItem> | null>(null)
  const [resume, setResume] = useState<ResumeEntry | null>(null)
  const [error, setError] = useState('')
  const [publishing, setPublishing] = useState<CollectionItem | null>(null)
  const [publishBusy, setPublishBusy] = useState(false)
  const [publishConfirm, setPublishConfirm] = useState(false)

  useEffect(() => {
    let active = true
    selectToday()
      .then((value) => active && setToday(value))
      .catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : 'Не удалось загрузить'))
    return () => {
      active = false
    }
  }, [revision])

  useEffect(() => {
    let active = true
    selectCollection(sort, page)
      .then((value) => active && setList(value))
      .catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : 'Не удалось загрузить'))
    return () => {
      active = false
    }
  }, [page, sort, revision])

  useEffect(() => {
    const sync = () => setResume(readResume(owner))
    sync()
    window.addEventListener('focus', sync)
    return () => window.removeEventListener('focus', sync)
  }, [owner])

  async function remove(item: CollectionItem) {
    const deleteOwned = !item.published && item.source !== 'library'
    const ok = await confirm(deleteOwned ? 'Удалить текст?' : 'Убрать текст из подборки?')
    if (!ok) return
    try {
      if (deleteOwned) await deleteText(item.textId)
      else await removeFromCollection(item.id)
    } catch (reason) {
      notifyError(reason instanceof Error ? reason.message : 'Не удалось удалить текст')
      return
    }
    if (deleteOwned && resume?.id === item.textId) {
      clearResume(owner)
      setResume(null)
    }
    try {
      const [nextList, nextToday] = await Promise.all([selectCollection(sort, page), selectToday()])
      setPage(nextList.page)
      setList(nextList)
      setToday(nextToday)
    } catch {
      notifyError('Текст удалён, но список не обновился. Обновите страницу.')
      return
    }
    notify(deleteOwned ? 'Текст удалён' : 'Убрано из подборки')
  }

  async function vote(item: CollectionItem, value: number) {
    try {
      const next = await voteLibrary(item.textId, value)
      setList((current) =>
        current
          ? {
              ...current,
              items: current.items.map((entry) =>
                entry.textId === item.textId ? { ...entry, rating: next.rating, ratingCount: next.ratingCount, score: next.score } : entry,
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
    } catch (reason: unknown) {
      notifyError(reason instanceof Error ? reason.message : 'Не удалось закрепить')
      return
    }
    try {
      const nextPage = item.pinned ? page : 1
      const nextList = await selectCollection(sort, nextPage)
      setPage(nextList.page)
      setList(nextList)
    } catch {
      notifyError('Список не обновился. Обновите страницу.')
      return
    }
    notify(item.pinned ? 'Откреплено' : 'Закреплено')
  }

  async function publish() {
    if (!publishing || !publishConfirm) return
    setPublishBusy(true)
    try {
      await publishCollection(publishing.id)
    } catch (reason: unknown) {
      notifyError(reason instanceof Error ? reason.message : 'Не удалось опубликовать')
      setPublishBusy(false)
      return
    }
    setPublishing(null)
    setPublishConfirm(false)
    notify('Текст опубликован')
    try {
      const nextList = await selectCollection(sort, page)
      setPage(nextList.page)
      setList(nextList)
    } catch {
      notifyError('Текст опубликован, но список не обновился. Обновите страницу.')
    } finally {
      setPublishBusy(false)
    }
  }

  return (
    <div>
      <header className="header">
        <h1>Подборка</h1>
        <div className="gap8">
          <Link href="/text" className="icon-btn" aria-label="Добавить текст">
            <Plus size={20} />
          </Link>
          <Link href="/settings" className="icon-btn" aria-label="Настройки">
            <Settings size={20} />
          </Link>
        </div>
      </header>
      {resume ? (
        <section className={styles.section}>
          <Link href={`/read/${resume.id}`} className={`card ${styles.resume}`}>
            <span className="muted small">Продолжить чтение</span>
            <strong>{resume.title}</strong>
            <span className="muted small">
              {Math.round(resume.progress * 100)}% · страница {Math.min(resume.page + 1, resume.pageCount)} из {resume.pageCount}
            </span>
          </Link>
        </section>
      ) : null}
      {error ? <p className="form-error pad">{error}</p> : null}
      {today ? (
        <section className={styles.section}>
          <div className="row">
            <h2>Сегодня</h2>
            <Link href="/stats" className="chip" data-tip="Статистика чтения и слов">
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
        {today && today.friends.length === 0 ? (
          <p className={`small muted ${styles.friendsEmpty}`}>
            Пока никого нет. Добавьте друга на странице «Друзья».
          </p>
        ) : null}
        {today?.friends.map((friend) => (
          <div className={friendStyles.friend} key={friend.id}>
            <div className={friendStyles.avatar}>{friend.name.slice(0, 1)}</div>
            <div>
              <div className={friendStyles.name}>{friend.name}</div>
              <div className={friendStyles.sub}>{friend.minutesLabel}</div>
            </div>
            <div className={friendStyles.streak} data-tip="Серия дней подряд">
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
                <span className="badge">
                  {item.published ? 'Библиотека' : item.source === 'chat' ? 'Создано в чате' : 'Загружено'}
                </span>
                <button
                  type="button"
                  className={item.pinned ? styles.pinOn : styles.pin}
                  aria-label={item.pinned ? 'Открепить' : 'Закрепить'}
                  aria-pressed={item.pinned}
                  title={item.pinned ? 'Открепить' : 'Закрепить'}
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
                <Stars average={item.rating} mine={item.score} count={item.ratingCount} onPick={(value) => vote(item, value)} />
                <span>{(item.progress * 100).toFixed(2)}%</span>
                <span>{item.minutes} мин · {item.level}</span>
                <span>{item.topic}</span>
                {item.published ? <PublishedBadge /> : null}
              </div>
              {!item.published ? (
                <div className="actions">
                  <button
                    className="btn ghost wrap"
                    onClick={() => {
                      setPublishConfirm(false)
                      setPublishing(item)
                    }}
                  >
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
      <ConfirmDialog
        open={Boolean(publishing)}
        title="Опубликовать текст?"
        confirmLabel="Опубликовать"
        busyLabel="Публикую…"
        busy={publishBusy}
        confirmDisabled={!publishConfirm}
        onClose={() => {
          setPublishing(null)
          setPublishConfirm(false)
        }}
        onConfirm={() => void publish()}
      >
        <p>Текст появится в общей библиотеке и станет виден другим пользователям.</p>
        <ul>
          <li>его смогут читать, оценивать и добавлять в свою подборку;</li>
          <li>он попадёт в поиск и рейтинг библиотеки;</li>
          <li>убрать текст из библиотеки после публикации нельзя.</li>
        </ul>
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
