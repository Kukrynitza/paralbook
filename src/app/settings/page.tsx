'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { minLength, pipe, safeParse, string } from 'valibot'
import changePasswordAction from '@/actions/Profile/changePassword'
import updateMe from '@/actions/Profile/updateMe'
import seedVocabulary from '@/actions/Vocabulary/seedVocabulary'
import { GOALS, INTERESTS, LEVELS, type Cefr, type ThemePref, type User } from '@/sorse/types'
import { useAuth, useUi } from '@/contexts/AuthContext'
import { markSeedAsked } from '@/sorse/prefs'
import styles from './page.module.css'

const currentSchema = pipe(string(), minLength(1, 'Введите текущий пароль'))
const nextSchema = pipe(string(), minLength(8, 'Новый пароль — не менее 8 символов'))

export default function Page() {
  const { user, setUser, logout } = useAuth()
  const { notify } = useUi()
  const router = useRouter()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [shown, setShown] = useState(false)
  const [error, setError] = useState('')
  const [offerLevel, setOfferLevel] = useState<Cefr | null>(null)
  if (!user) return null

  const resolved: ThemePref =
    user.theme === 'system'
      ? typeof window === 'undefined'
        ? 'dark'
        : window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
      : user.theme

  async function patch(body: Partial<User>) {
    const updated = await updateMe(body)
    if (updated) setUser(updated)
    notify('Сохранено')
  }

  async function chooseLevel(level: Cefr) {
    if (user?.cefr === level) return
    await patch({ cefr: level })
    setOfferLevel(level)
  }

  async function loadOfferedWords() {
    if (!offerLevel) return
    const result = await seedVocabulary()
    markSeedAsked(offerLevel)
    setOfferLevel(null)
    notify(result.added.length ? 'Слова загружены' : 'Эти слова уже в словаре')
  }

  function skipOfferedWords() {
    if (offerLevel) markSeedAsked(offerLevel)
    setOfferLevel(null)
  }

  function chooseTheme(value: 'light' | 'dark') {
    if (user?.theme === 'system' && value === resolved) return
    if (user?.theme === value) return
    void patch({ theme: value })
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault()
    setError('')
    const currentCheck = safeParse(currentSchema, current)
    if (!currentCheck.success) {
      setError(currentCheck.issues[0].message)
      return
    }
    const nextCheck = safeParse(nextSchema, next)
    if (!nextCheck.success) {
      setError(nextCheck.issues[0].message)
      return
    }
    if (nextCheck.output !== again) {
      setError('Пароли не совпадают')
      return
    }
    try {
      const error = await changePasswordAction({ current: currentCheck.output, next: nextCheck.output })
      if (error) {
        setError(error)
        return
      }
      setCurrent('')
      setNext('')
      setAgain('')
      notify('Пароль изменён')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сменить пароль')
    }
  }

  function toggleInterest(interest: string) {
    const interests = user?.interests.includes(interest)
      ? user.interests.filter((item) => item !== interest)
      : [...(user?.interests ?? []), interest]
    void patch({ interests })
  }

  return (
    <div>
      <header className="header">
        <button className="back" onClick={() => router.back()} aria-label="Назад">
          <ArrowLeft size={22} />
        </button>
        <h1>Настройки аккаунта</h1>
      </header>
      <div className="pad stack">
        <div>
          <div className="label">Email</div>
          <div style={{ marginTop: 6 }}>{user.email}</div>
        </div>
        <form className="stack" onSubmit={changePassword}>
          <strong>Смена пароля</strong>
          {[
            ['Текущий пароль', current, setCurrent],
            ['Новый пароль', next, setNext],
            ['Подтвердите новый пароль', again, setAgain],
          ].map(([label, value, setter]) => (
            <div className="input-wrap" key={String(label)}>
              <input
                className="input compact"
                type={shown ? 'text' : 'password'}
                placeholder={String(label)}
                value={String(value)}
                onChange={(event) => (setter as (item: string) => void)(event.target.value)}
              />
              <button type="button" className="eye" onClick={() => setShown((item) => !item)} aria-label="Показать пароль">
                {shown ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
            </div>
          ))}
          <p className="small muted">Новый пароль — не менее 8 символов</p>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="btn slim">Сменить пароль</button>
        </form>
        <div>
          <strong>Уровень английского</strong>
          <div className="gap8" style={{ marginTop: 8 }}>
            {LEVELS.map((level) => (
              <button key={level} className={user.cefr === level ? 'chip on' : 'chip'} onClick={() => chooseLevel(level)}>
                {level}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="row">
            <strong>Интересы</strong>
            <span className="small muted">Можно выбрать несколько</span>
          </div>
          <div className="gap8" style={{ marginTop: 8 }}>
            {INTERESTS.map((interest) => {
              const on = user.interests.includes(interest)
              return (
                <button key={interest} className={on ? 'chip on' : 'chip'} onClick={() => toggleInterest(interest)}>
                  {on ? '✓ ' : ''}
                  {interest}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <strong>Цель на день</strong>
          <div className="gap8" style={{ marginTop: 8 }}>
            {GOALS.map((goal) => (
              <button key={goal} className={user.dailyGoalMin === goal ? 'chip on' : 'chip'} onClick={() => patch({ dailyGoalMin: goal })}>
                {goal} мин
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="row">
            <strong style={{ fontSize: 13 }}>Показывать друзьям мои минуты</strong>
            <button className={user.showMinutes ? `${styles.toggle} ${styles.toggleOn}` : styles.toggle} onClick={() => patch({ showMinutes: !user.showMinutes })} aria-label="Показывать минуты">
              <i />
            </button>
          </div>
          <p className="small muted">Друзья видят только минуты сегодня и серию</p>
        </div>
        <div>
          <strong>Тема</strong>
          <div className={styles.seg} style={{ marginTop: 8 }}>
            <button type="button" className={resolved === 'dark' ? styles.on : ''} onClick={() => chooseTheme('dark')}>
              Тёмная
            </button>
            <button type="button" className={resolved === 'light' ? styles.on : ''} onClick={() => chooseTheme('light')}>
              Светлая
            </button>
          </div>
        </div>
        <button
          className="btn ghost slim"
          onClick={() => {
            logout()
            router.push('/login')
          }}
        >
          Выйти
        </button>
        <Link className="btn slim" href="/stats">
          Статистика недели
        </Link>
      </div>
      {offerLevel ? (
        <div className="modal-dim">
          <div className="modal">
            <h2>Слова для уровня {offerLevel}</h2>
            <p>Загрузить стартовый набор для нового уровня? Слова, которые уже есть, не повторятся.</p>
            <div className="actions">
              <button className="btn ghost" onClick={skipOfferedWords}>
                Не сейчас
              </button>
              <button className="btn" onClick={loadOfferedWords}>
                Загрузить
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
