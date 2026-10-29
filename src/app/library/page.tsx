'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Search, X } from 'lucide-react'
import saveLibrary from '@/actions/Library/saveLibrary'
import selectLibrary from '@/actions/Library/selectLibrary'
import voteLibrary from '@/actions/Library/voteLibrary'
import { type LibraryItem, type PageResult } from '@/sorse/types'
import { useUi } from '@/contexts/AuthContext'
import Pager from '@/components/Pager/Pager'
import Stars from '@/components/Stars/Stars'

const sorts = [
  { id: 'new', label: 'Новые' },
  { id: 'rating', label: 'Рейтинг' },
  { id: 'length', label: 'Длина' },
]

export default function Page() {
  const { notify } = useUi()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('new')
  const [page, setPage] = useState(1)
  const [list, setList] = useState<PageResult<LibraryItem> | null>(null)

  useEffect(() => {
    const handle = window.setTimeout(() => {
      selectLibrary(query, sort, page).then(setList)
    }, 200)
    return () => window.clearTimeout(handle)
  }, [page, query, sort])

  async function vote(item: LibraryItem, value: number) {
    try {
      const next = await voteLibrary(item.id, value)
      setList((current) =>
        current
          ? {
              ...current,
              items: current.items.map((entry) =>
                entry.id === item.id ? { ...entry, rating: next.rating, score: next.score } : entry,
              ),
            }
          : current,
      )
    } catch (reason: unknown) {
      notify(reason instanceof Error ? reason.message : 'Не удалось сохранить оценку')
    }
  }

  async function save(item: LibraryItem) {
    if (item.saved) return
    await saveLibrary(item.id)
    setList((current) =>
      current
        ? { ...current, items: current.items.map((entry) => (entry.id === item.id ? { ...entry, saved: true } : entry)) }
        : current,
    )
    notify('В подборке')
  }

  const empty = list && query.trim() && list.total === 0

  return (
    <div>
      <header className="header">
        <h1>Библиотека</h1>
      </header>
      <label className="search">
        <Search size={18} />
        <input
          value={query}
          placeholder="Поиск по теме или уровню"
          onChange={(event) => {
            setQuery(event.target.value)
            setPage(1)
          }}
        />
        {query ? (
          <button
            type="button"
            className="icon-btn"
            aria-label="Очистить"
            onClick={() => {
              setQuery('')
              setPage(1)
            }}
          >
            <X size={16} />
          </button>
        ) : null}
      </label>
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
      {empty ? (
        <div className="empty">
          <Search size={28} />
          <h2>Ничего не нашлось</h2>
          <p>Попробуйте другую тему или уровень.</p>
          <button className="btn" onClick={() => setQuery('')}>
            Очистить поиск
          </button>
        </div>
      ) : (
        <div className="list">
          {list?.items.map((item) => (
            <article className="card" key={item.id}>
              <div className="row">
                <h3 style={{ margin: 0 }}>
                  <Link href={`/read/${item.id}`}>{item.title}</Link>
                </h3>
                <span className="badge level">{item.level}</span>
              </div>
              <p>{item.excerpt}</p>
              <div className="meta">
                {item.saved ? (
                  <Stars average={item.rating} mine={item.score} onPick={(value) => vote(item, value)} />
                ) : item.rating == null ? null : (
                  <span>★ {item.rating.toFixed(1)}</span>
                )}
                <span>{item.minutes} мин</span>
                <span>{item.topic}</span>
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <button className="btn ghost slim" style={{ width: 'auto', marginLeft: 'auto' }} disabled={item.saved} onClick={() => save(item)}>
                  <Plus size={16} />
                  {item.saved ? 'В подборке' : 'В подборку'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {list && !empty ? <Pager page={list.page} pages={list.pages} onPage={setPage} /> : null}
    </div>
  )
}
