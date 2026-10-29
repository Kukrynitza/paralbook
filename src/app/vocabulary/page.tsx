'use client'
import Pager from '@/components/Pager/Pager'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Clock, Eye, Filter, Play, Search, SlidersHorizontal } from 'lucide-react'
import seedVocabulary from '@/actions/Vocabulary/seedVocabulary'
import selectVocabulary from '@/actions/Vocabulary/selectVocabulary'
import { type VocabItem } from '@/sorse/types'
import { useAuth, useUi } from '@/contexts/AuthContext'
import { sideColor } from '@/sorse/answerColor'
import { markSeedAsked, readDailyNew, writeDailyNew } from '@/sorse/prefs'
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

const PACKS = [
  ['own', 'Свои слова'],
  ['texts', 'Из текстов'],
  ['r100', '1–100'],
  ['r1000', '101–1000'],
  ['r3000', '1001–3000'],
  ['A1', 'A1'],
  ['A2', 'A2'],
  ['B1', 'B1'],
  ['B2', 'B2'],
  ['C1', 'C1'],
  ['C2', 'C2'],
] as const

const STATUSES = [
  ['all', 'Все'],
  ['ok', 'Верно'],
  ['error', 'Ошибки'],
  ['sum', 'Сумма'],
] as const

export default function Page() {
  const router = useRouter()
  const [page, setPage] = useState(0)
  const { user } = useAuth()
  const { notify } = useUi()
  const [items, setItems] = useState<VocabItem[] | null>(null)
  const [pageItems, setPageItems] = useState<VocabItem[] | null>(null)
  const [hasWords, setHasWords] = useState<boolean | null>(null)
  const [query, setQuery] = useState('')
  const [studyOpen, setStudyOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [status, setStatus] = useState('sum')
  const [confirmSeed, setConfirmSeed] = useState(false)
  const [packs, setPacks] = useState<string[]>([])
  const [daily, setDaily] = useState(10)

  useEffect(() => {
    let active = true
    const narrowed = Boolean(query.trim()) || packs.length > 0 || (status !== 'all' && status !== 'sum')
    selectVocabulary(query, status, packs).then(async (data) => {
      if (!active) return
      setItems(data.items)
      if (data.items.length > 0) {
        setHasWords(true)
        return
      }
      if (!narrowed) {
        setHasWords(false)
        return
      }
      const all = await selectVocabulary('', 'all', [])
      if (!active) return
      setHasWords(all.items.length > 0)
    })
    setPage(0)
    return () => {
      active = false
    }
  }, [query, status, packs])

  useEffect(() => {
    setDaily(readDailyNew())
  }, [])

  useEffect(() => {
    setPageItems(items?.slice(page * 30, (page + 1) * 30) || null)
  }, [page, items])

  function dismissSeed() {
    if (user) markSeedAsked(user.cefr)
    setConfirmSeed(false)
  }

  function resetFilters() {
    setQuery('')
    setStatus('sum')
    setPacks([])
  }

  function openStudy() {
    writeDailyNew(daily)
    const chosen = packs.length ? packs : user ? [user.cefr] : []
    const next = new URLSearchParams({ daily: String(daily) })
    if (chosen.length) next.set('packs', chosen.join(','))
    router.push(`/study?${next.toString()}`)
  }

  async function seed() {
    try {
      const result = await seedVocabulary()
      if (user) markSeedAsked(user.cefr)
      setConfirmSeed(false)
      setQuery('')
      setStatus('sum')
      setPacks([])
      setPage(0)
      const data = await selectVocabulary('', 'sum', [])
      setItems(data.items)
      setHasWords(data.items.length > 0)
      notify(result.added.length ? 'Слова загружены' : 'Эти слова уже в словаре')
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Не удалось загрузить слова')
    }
  }

  if (!pageItems || (pageItems.length === 0 && hasWords === null)) return <p className="loading">Загрузка…</p>
  const dictionaryEmpty = hasWords === false
  return (
    <div>
      <header className="header">
        <h1>Мой словарь</h1>
        <div className={styles.tools}>
          <button className="icon-btn" aria-label="Повторение" onClick={() => setStudyOpen((value) => !value)}>
            <SlidersHorizontal size={20} />
          </button>
          <button className="icon-btn" aria-label="Фильтр" onClick={() => setFilterOpen((value) => !value)}>
            <Filter size={20} />
          </button>
        </div>
      </header>
      <label className="search">
        <Search size={18} />
        <input value={query} placeholder="Слово" onChange={(event) => setQuery(event.target.value)} />
      </label>
      {studyOpen ? (
        <div className="pad stack">
          <div className={styles.popover}>
            {PACKS.map(([id, label]) => (
              <button
                key={id}
                className={packs.includes(id) ? 'chip on' : 'chip'}
                onClick={() => setPacks((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])}
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
              className={styles.range}
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
          <button className="btn" onClick={openStudy}>
            Выбрать режим
          </button>
        </div>
      ) : null}
      {filterOpen ? (
        <div className={`${styles.popover} ${styles.panel}`}>
          {STATUSES.map(([id, label]) => (
            <button key={id} className={status === id ? 'chip on' : 'chip'} onClick={() => setStatus(id)}>
              {label}
            </button>
          ))}
        </div>
      ) : null}
      {dictionaryEmpty ? (
        <div className="empty">
          <h2>Словарь пуст</h2>
          <p>Загрузите слова своего уровня или добавляйте их из текста.</p>
          <p>Тренировка появится, когда в словаре будут слова.</p>
          <button className="btn" onClick={() => setConfirmSeed(true)}>
            <Eye size={16} />
            Загрузить слова для моего уровня
          </button>
        </div>
      ) : pageItems.length === 0 ? (
        <div className="empty">
          <h2>По этому фильтру слов нет</h2>
          <p>Сбросьте поиск, пачку или статус, чтобы снова увидеть свои слова.</p>
          <button className="btn ghost" onClick={resetFilters}>
            Сбросить
          </button>
        </div>
      ) : (
        <ul>
          <div className="list">
            {pageItems.map((item) => (
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
      {pageItems.length > 0 ? (
        <Link className={styles.fab} href="/study" aria-label="Режимы повторения" title="Режимы повторения">
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
