'use client'
import Pager from '@/components/Pager/Pager'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Clock, Eye, Filter, Play, Search, SlidersHorizontal } from 'lucide-react'
import seedVocabulary from '@/actions/Vocabulary/seedVocabulary'
import selectVocabulary from '@/actions/Vocabulary/selectVocabulary'
import { type VocabItem } from '@/sorse/types'
import { useAuth, useUi } from '@/contexts/AuthContext'
import { sideColor } from '@/sorse/answerColor'
import { markSeedAsked, readTraining, seedAskedFor, writeTraining, type TrainSetup } from '@/sorse/prefs'
import styles from './words.module.css'

function mark(example: string, lemma: string) {
  const index = example.toLowerCase().indexOf(lemma.toLowerCase())
  if (index < 0) return example
  return (
    <>
      {example.slice(0, index)}
      <span className={styles.hit}>{example.slice(index, index + lemma.length)}</span>
      {example.slice(index + lemma.length)}
    </>
  )
}

export default function Page() {
  const [page, setPage] = useState(0)
  const { user } = useAuth()
  const { notify } = useUi()
  const [items, setItems] = useState<VocabItem[] | null>(null)
  const [pageItems, setPageItems] = useState<VocabItem[] | null>(null)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [status, setStatus] = useState('sum')
  const [confirmSeed, setConfirmSeed] = useState(false)
  const [trainOpen, setTrainOpen] = useState(false)
  const [train, setTrain] = useState<TrainSetup>(() => readTraining())

  function load(nextQuery = query, nextStatus = status) {
    return selectVocabulary(nextQuery, nextStatus).then((data) =>
      setItems(data.items),
    )
  }

  useEffect(() => {
    let active = true
    selectVocabulary(query, status).then((data) => {
      if (!active) return
      setItems(data.items)
      if (data.items.length === 0 && !query && status === 'all' && user && !seedAskedFor(user.cefr)) setConfirmSeed(true)
      })
    setPage(0)
    return () => {
      active = false
    }
  }, [query, status, user])

  useEffect(() => {
    setPageItems(items?.slice(page * 30, (page + 1) * 30) || null)
  },[page, items])

  useEffect(() => {
  },[items?.length])

  function dismissSeed() {
    if (user) markSeedAsked(user.cefr)
    setConfirmSeed(false)
  }

  function changeTrain(next: TrainSetup) {
    const total = Math.min(50, Math.max(5, next.total))
    const fresh = Math.min(30, Math.max(0, next.fresh), total)
    const value = { fresh, total }
    setTrain(value)
    writeTraining(value)
  }

  async function seed() {
    const result = await seedVocabulary()
    if (user) markSeedAsked(user.cefr)
    setConfirmSeed(false)
    await load('', 'all')
    setStatus('all')
    setQuery('')
    notify(result.added.length ? 'Слова загружены' : 'Эти слова уже в словаре')
  }

  if (!pageItems) return <p className="pad muted">Загрузка…</p>
  return (
    <div>
      <header className="header">
        <h1>Мой словарь</h1>
        <div className={styles.tools}>
          <button className="icon-btn" aria-label="Поиск" onClick={() => setSearchOpen((value) => !value)}>
            <Search size={20} />
          </button>
          <button className="icon-btn" aria-label="Настройки тренировки" onClick={() => setTrainOpen((value) => !value)}>
            <SlidersHorizontal size={20} />
          </button>
          <button className="icon-btn" aria-label="Фильтр" onClick={() => setFilterOpen((value) => !value)}>
            <Filter size={20} />
          </button>
        </div>
      </header>
      {searchOpen ? (
        <label className="search">
          <Search size={18} />
          <input value={query} placeholder="Слово" onChange={(event) => setQuery(event.target.value)} />
        </label>
      ) : null}
      {trainOpen ? (
        <div className="pad stack">
          <strong>Тренировка</strong>
          <div>
            <div className="row">
              <span>Новые слова</span>
              <span className="muted">{train.fresh}</span>
            </div>
            <input
              className={styles.range}
              type="range"
              min={0}
              max={30}
              value={train.fresh}
              onChange={(event) => changeTrain({ ...train, fresh: Number(event.target.value) })}
            />
          </div>
          <div>
            <div className="row">
              <span>Всего карточек</span>
              <span className="muted">{train.total}</span>
            </div>
            <input
              className={styles.range}
              type="range"
              min={5}
              max={50}
              value={train.total}
              onChange={(event) => changeTrain({ ...train, total: Number(event.target.value) })}
            />
          </div>
          <p className="small muted">Повтор: {train.total - train.fresh}. Эти числа применятся при запуске тренировки.</p>
        </div>
      ) : null}
      {filterOpen ? (
        <div className={styles.popover} style={{ paddingTop: 12 }}>
          {[
            ['all', 'Все'],
            ['ok', 'Верно'],
            ['error', 'Ошибки'],
            ['sum', 'Сумма'],
          ].map(([id, label]) => (
            <button key={id} className={status === id ? 'chip on' : 'chip'} onClick={() => setStatus(id)}>
              {label}
            </button>
          ))}
        </div>
      ) : null}
      {pageItems?.length === 0 && !query && status === 'all' ? (
        <div className="empty">
          <h2>Словарь пуст</h2>
          <p>Загрузите слова своего уровня или добавляйте их из текста.</p>
          <p>Тренировка появится, когда в словаре будут слова.</p>
          <button className="btn" onClick={() => setConfirmSeed(true)}>
            <Eye size={16} />
            Загрузить слова для моего уровня
          </button>
        </div>
      ) : (
        <ul>
        <div className="list">
          {pageItems?.map((item) => (
            <Link key={item.id} href={`/vocabulary/${item.id}`} className={item.tone === 'ok' ? `${styles.card} ${styles.ok}` : `${styles.card} ${styles.error}`} style={sideColor(item.correct, item.wrong)}>
              <div className="row">
                <h3>{item.lemma}</h3>
                {item.tone === 'ok' ? <Check size={16} color="var(--ok)" /> : <Clock size={16} color="var(--danger)" />}
              </div>
              <p>{item.example ? mark(item.example, item.lemma) : item.translation}</p>
              <div className={item.tone === 'ok' ? `${styles.stats} ${styles.statsOk}` : `${styles.stats} ${styles.statsError}`}>
                Верно: {item.correct} · Ошибки: {item.wrong}
              </div>
            </Link>
          ))}
        </div>
        <Pager
        className={styles.pager}
        page={page + 1}
        pages={items?.length ? Math.ceil(items.length / 30) : 0}
        onPage={(next) => setPage(next - 1)}
      />
      </ul>
      )}
      {pageItems?.length > 0 ? (
        <Link className={styles.fab} href="/train" aria-label="Тренировка">
          <Play size={24} fill="currentColor" />
        </Link>
      ) : null}
      {confirmSeed ? (
        <div className="modal-dim">
          <div className="modal">
            <h2>Слова для уровня {user?.cefr}</h2>
            <p>Загрузить стартовый набор? Слова, которые уже есть, не повторятся.</p>
            <div className="actions">
              <button className="btn ghost" onClick={dismissSeed}>
                Отмена
              </button>
              <button className="btn" onClick={seed}>
                Загрузить
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
