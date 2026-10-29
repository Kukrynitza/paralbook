'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Flame } from 'lucide-react'
import selectStats from '@/actions/Stats/selectStats'
import { type StatBar, type StatTotals, type Stats, type StatsRange } from '@/sorse/types'
import styles from './page.module.css'

const RANGES: [StatsRange, string][] = [
  ['7', '7 дней'],
  ['30', '30 дней'],
  ['90', '90 дней'],
  ['year', 'Год'],
  ['all', 'Всё время'],
]

const LINES: [keyof StatTotals, string][] = [
  ['fresh', 'Новые слова'],
  ['reviewed', 'Повторено'],
  ['mastered', 'Выучено'],
  ['known', 'Уже известны'],
]

export default function Page() {
  const router = useRouter()
  const [range, setRange] = useState<StatsRange>('7')
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    let active = true
    selectStats(range).then((next) => {
      if (active) setStats(next)
    })
    return () => {
      active = false
    }
  }, [range])

  if (!stats) return <p className="loading">Загрузка…</p>
  const max = Math.max(1, ...stats.days.map((day) => day.fresh + day.reviewed + day.known + day.mastered))

  return (
    <div>
      <header className="header">
        <button className="back" onClick={() => router.back()} aria-label="Назад">
          <ArrowLeft size={22} />
        </button>
        <h1>Статистика</h1>
      </header>
      <div className="pad stack">
        <article className="card">
          <div className="row">
            <Flame color="var(--accent)" />
            <strong style={{ marginRight: 'auto' }}>Серия</strong>
          </div>
          <div className="big" style={{ textAlign: 'left', fontSize: 40 }}>
            {stats.streak}
          </div>
          <p className="small muted">Дней подряд с чтением или карточками</p>
        </article>
        <article className="card">
          <h2 style={{ margin: 0 }}>Слова</h2>
          <div className="row" style={{ marginTop: 12 }}>
            <span className="muted">Минуты за неделю</span>
            <span>{stats.weekMinutes} мин</span>
          </div>
          <div className={styles.ranges}>
            {RANGES.map(([id, label]) => (
              <button key={id} className={range === id ? 'chip on' : 'chip'} onClick={() => setRange(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className={styles.plot}>
            <div className={styles.y} aria-hidden="true">
              <span>{max}</span>
              <span>{Math.round(max / 2)}</span>
              <span>0</span>
            </div>
            <div className={styles.scroll}>
              <div className={styles.chart}>
                {stats.days.map((day) => (
                  <Bar key={`${range}-${day.label}`} day={day} max={max} />
                ))}
              </div>
            </div>
          </div>
          <div className={styles.legend}>
            <span><i className={styles.fresh} /> Новые</span>
            <span><i className={styles.reviewed} /> Повтор</span>
            <span><i className={styles.known} /> Уже знал</span>
            <span><i className={styles.mastered} /> Выученные</span>
          </div>
          <div className={styles.compare}>
            <Column title="За всё время" totals={stats.totals} />
            <Column title="За 7 дней" totals={stats.week} />
          </div>
        </article>
      </div>
    </div>
  )
}

function Bar({ day, max }: { day: StatBar; max: number }) {
  const total = day.fresh + day.reviewed + day.known + day.mastered
  const sections = [day.mastered, day.known, day.reviewed, day.fresh].filter(Boolean).length
  const height = Math.max(sections * 20, Math.round((total / max) * 180))
  return (
    <div className={styles.day}>
      <span>{total || ''}</span>
      <div className={styles.stack} style={{ height, opacity: total ? 1 : 0.35 }}>
        {day.mastered ? <i className={styles.mastered} style={{ flexGrow: day.mastered }}>{day.mastered}</i> : null}
        {day.known ? <i className={styles.known} style={{ flexGrow: day.known }}>{day.known}</i> : null}
        {day.reviewed ? <i className={styles.reviewed} style={{ flexGrow: day.reviewed }}>{day.reviewed}</i> : null}
        {day.fresh ? <i className={styles.fresh} style={{ flexGrow: day.fresh }}>{day.fresh}</i> : null}
      </div>
      <span>{day.label}</span>
    </div>
  )
}

function Column({ title, totals }: { title: string; totals: StatTotals }) {
  return (
    <div>
      <strong>{title}</strong>
      {LINES.map(([key, label]) => (
        <div className={styles.line} key={key}>
          <span>{label}</span>
          <b>{totals[key]}</b>
        </div>
      ))}
    </div>
  )
}
