'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Flame } from 'lucide-react'
import selectStats from '@/actions/Stats/selectStats'
import { type Stats } from '@/sorse/types'
import styles from './page.module.css'

export default function Page() {
  const router = useRouter()
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    selectStats().then(setStats)
  }, [])

  if (!stats) return <p className="pad muted">Загрузка…</p>
  const max = Math.max(1, ...stats.days.map((day) => day.minutes))
  const ratio = stats.goalMin ? Math.min(100, Math.round((stats.todayMin / stats.goalMin) * 100)) : 0

  return (
    <div>
      <header className="header">
        <button className="back" onClick={() => router.back()} aria-label="Назад">
          <ArrowLeft size={22} />
        </button>
        <h1>Статистика недели</h1>
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
          <h2 style={{ margin: 0 }}>Минуты за неделю</h2>
          <div className="row" style={{ marginTop: 12 }}>
            <span className="muted">По дням</span>
            <span>{stats.weekMinutes} мин</span>
          </div>
          <div className={styles.chart}>
            {stats.days.map((day) => (
              <div className={styles.day} key={day.label}>
                <span>{day.minutes || ''}</span>
                <div className={styles.col} style={{ height: `${Math.max(4, (day.minutes / max) * 120)}px`, opacity: day.minutes ? 1 : 0.25 }} />
                <span>{day.label}</span>
              </div>
            ))}
          </div>
        </article>
        <article className="card">
          <div className="row">
            <span>Цель на сегодня</span>
            <span>
              {stats.todayMin} / {stats.goalMin} мин
            </span>
          </div>
          <div className="bar" style={{ margin: '12px 0' }}>
            <i style={{ width: `${ratio}%` }} />
          </div>
          <p className="small muted">{stats.leftMin > 0 ? `Ещё ${stats.leftMin} минут до цели` : 'Цель на сегодня закрыта'}</p>
        </article>
      </div>
    </div>
  )
}
