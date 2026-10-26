'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Check } from 'lucide-react'
import { maxLength, minLength, pipe, safeParse, string, trim } from 'valibot'
import removeVocabulary from '@/actions/Vocabulary/removeVocabulary'
import selectVocabularyItem from '@/actions/Vocabulary/selectVocabularyItem'
import updateVocabulary from '@/actions/Vocabulary/updateVocabulary'
import selectWord from '@/actions/Words/selectWord'
import WordArticle from '@/components/WordArticle/WordArticle'
import { HINT_MAX } from '@/sorse/hint'
import { type DictEntry, type VocabItem } from '@/sorse/types'
import { useUi } from '@/contexts/AuthContext'
import styles from '../words.module.css'

const hintSchema = pipe(
  string(),
  trim(),
  minLength(1, 'Напишите подсказку перед сохранением'),
  maxLength(HINT_MAX, 'Подсказка короткая, до 80 символов'),
)

export default function Page() {
  const params = useParams()
  const id = String(params?.id ?? '')
  const router = useRouter()
  const { confirm, notify } = useUi()
  const [item, setItem] = useState<VocabItem | null>(null)
  const [entry, setEntry] = useState<DictEntry | null>(null)
  const [hint, setHint] = useState('')
  const [phase, setPhase] = useState<'idle' | 'loading' | 'error'>('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    selectVocabularyItem(id)
      .then(async (value) => {
        if (!active) return null
        setItem(value)
        setHint(value.hint ?? '')
        return selectWord(value.lemma)
      })
      .then((word) => {
        if (active && word) setEntry(word)
      })
      .catch((reason: unknown) => {
        if (active) setMessage(reason instanceof Error ? reason.message : 'Не удалось загрузить')
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

  if (!item || !entry) {
    if (message) return <p className="form-error pad">{message}</p>
    return <p className="pad muted">Загрузка…</p>
  }

  return (
    <div>
      <header className="header">
        <button className="back" onClick={() => router.back()} aria-label="Назад">
          <ArrowLeft size={22} />
        </button>
        <div className="grow">Слово</div>
        <span style={{ width: 24 }} />
      </header>
      <WordArticle
        lemma={entry.lemma}
        ipa={entry.ipa}
        rank={entry.rank}
        senses={entry.senses}
        extra={
          <label className="field">
            <span>Подсказка</span>
            <input
              className="input compact"
              maxLength={HINT_MAX}
              value={hint}
              onChange={(event) => setHint(event.target.value)}
            />
          </label>
        }
      />
      <div className="pad stack">
        <div className={item.tone === 'ok' ? `${styles.stats} ${styles.statsOk}` : `${styles.stats} ${styles.statsError}`}>
          Верно: {item.correct} · Ошибки: {item.wrong}
        </div>
        {phase === 'error' ? <p className="form-error">{message}</p> : null}
        <button className="btn" disabled={phase === 'loading'} onClick={save}>
          {phase === 'loading' ? 'Сохраняем…' : 'Сохранить'}
        </button>
        <button className="btn" disabled={item.mastered} onClick={master}>
          <Check size={16} />
          Запомнил
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
