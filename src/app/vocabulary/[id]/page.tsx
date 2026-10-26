'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Check } from 'lucide-react'
import { maxLength, minLength, pipe, safeParse, string, trim } from 'valibot'
import removeVocabulary from '@/actions/Vocabulary/removeVocabulary'
import selectVocabularyItem from '@/actions/Vocabulary/selectVocabularyItem'
import updateVocabulary from '@/actions/Vocabulary/updateVocabulary'
import { type VocabItem } from '@/sorse/types'
import { useUi } from '@/contexts/AuthContext'
import styles from '../words.module.css'

const hintSchema = pipe(string(), trim(), minLength(1, 'Напишите подсказку перед сохранением'), maxLength(500, 'Максимальная длина подсказки — 500'))

export default function Page() {
  const params = useParams()
  const id = String(params?.id ?? '')
  const router = useRouter()
  const { confirm, notify } = useUi()
  const [item, setItem] = useState<VocabItem | null>(null)
  const [hint, setHint] = useState('')
  const [phase, setPhase] = useState<'idle' | 'loading' | 'error'>('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    selectVocabularyItem(id).then((value) => {
      if (!active) return
      setItem(value)
      setHint(value.hint ?? '')
    })
    return () => {
      active = false
    }
  }, [id])

  async function save() {
    setPhase('loading')
    setMessage('')
    const parsed = safeParse(hintSchema, hint)
    if (!parsed.success) {
      setPhase('error')
      setMessage(parsed.issues[0].message)
      return
    }
    try {
      const next = await updateVocabulary(id, { hint: parsed.output })
      setItem(next)
      setPhase('idle')
      notify('Сохранено')
    } catch (reason) {
      setPhase('error')
      setMessage(reason instanceof Error ? reason.message : 'Не удалось сохранить')
    }
  }

  async function master() {
    const next = await updateVocabulary(id, { mastered: true })
    setItem(next)
    notify('Сохранено')
  }

  async function remove() {
    const ok = await confirm('Убрать слово из словаря?')
    if (!ok) return
    await removeVocabulary(id)
    router.push('/vocabulary')
  }

  if (!item) return <p className="pad muted">Загрузка…</p>

  return (
    <div>
      <header className="header">
        <button className="back" onClick={() => router.back()} aria-label="Назад">
          <ArrowLeft size={22} />
        </button>
        <div className="grow">Слово</div>
        <span style={{ width: 24 }} />
      </header>
      <div className="pad stack">
        <article className="card">
          <h2 style={{ margin: 0, fontSize: 28 }}>{item.lemma}</h2>
          <p className="muted">{item.ipa}</p>
          <p style={{ color: 'var(--text)', fontSize: 18 }}>{item.translation}</p>
          <hr className="line" />
          <p>{item.example}</p>
        </article>
        <div className={item.tone === 'ok' ? `${styles.stats} ${styles.statsOk}` : `${styles.stats} ${styles.statsError}`}>
          Верно: {item.correct} · Ошибки: {item.wrong}
        </div>
        <label className="field">
          <span>Подсказка</span>
          <textarea className="area" value={hint} onChange={(event) => setHint(event.target.value)} />
        </label>
        <p className="small muted">Можно поправить и сохранить</p>
        {phase === 'error' ? <p className="form-error">{message}</p> : null}
        <button className="btn" disabled={phase === 'loading'} onClick={save}>
          {phase === 'loading' ? 'Сохраняем…' : 'Сохранить'}
        </button>
        <button className="btn" disabled={item.mastered} onClick={master}>
          <Check size={16} />
          {item.mastered ? 'Запомнил' : 'Запомнил'}
        </button>
        <p className="small muted" style={{ textAlign: 'center' }}>
          После этого слово реже попадает в тренировку
        </p>
        <button className="btn ghost" onClick={remove}>
          Убрать из словаря
        </button>
      </div>
    </div>
  )
}
