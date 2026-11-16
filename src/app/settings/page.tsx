'use client'

import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Eye, EyeOff, Info, X } from 'lucide-react'
import { minLength, pipe, safeParse, string } from 'valibot'
import llmAccess from '@/actions/Llm/access'
import changePasswordAction from '@/actions/Profile/changePassword'
import systemInfo from '@/actions/Profile/systemInfo'
import updateMe from '@/actions/Profile/updateMe'
import seedVocabulary from '@/actions/Vocabulary/seedVocabulary'
import { GOALS, INTERESTS, LEVELS, type Cefr, type LlmSettingsView, type SystemInfo, type ThemePref, type User } from '@/sorse/types'
import { useAuth, useUi } from '@/contexts/AuthContext'
import { markSeedAsked } from '@/sorse/prefs'
import styles from './page.module.css'

const currentSchema = pipe(string(), minLength(1, 'Введите текущий пароль'))
const nextSchema = pipe(string(), minLength(8, 'Новый пароль — не менее 8 символов'))

const LLM_PRESETS = [
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { id: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  { id: 'mistral', label: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-small-latest' },
  { id: 'together', label: 'Together', baseUrl: 'https://api.together.xyz/v1', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' },
  { id: 'ollama', label: 'Ollama (локально)', baseUrl: 'http://localhost:11434/v1', model: 'llama3.1' },
  { id: 'lmstudio', label: 'LM Studio (локально)', baseUrl: 'http://localhost:1234/v1', model: 'local-model' },
  { id: 'custom', label: 'Свой сервер', baseUrl: '', model: '' },
] as const

function providerFor(baseUrl: string) {
  return LLM_PRESETS.find((item) => item.baseUrl && item.baseUrl === baseUrl)?.id ?? 'custom'
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={styles.row}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  )
}

async function llmRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const access = await llmAccess()
  const response = await fetch(`${access.url}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${access.token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
    cache: 'no-store',
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) {
    throw new Error(data && typeof data === 'object' && 'detail' in data ? String(data.detail) : 'Сервис модели ответил ошибкой')
  }
  return data as T
}

export default function Page() {
  const { user, setUser, logout } = useAuth()
  const { confirm, notify } = useUi()
  const router = useRouter()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [shown, setShown] = useState(false)
  const [error, setError] = useState('')
  const [offerLevel, setOfferLevel] = useState<Cefr | null>(null)
  const [llmSettings, setLlmSettings] = useState<LlmSettingsView | null>(null)
  const [llmProvider, setLlmProvider] = useState('custom')
  const [llmBaseUrl, setLlmBaseUrl] = useState('')
  const [llmModel, setLlmModel] = useState('')
  const [llmKey, setLlmKey] = useState('')
  const [llmShown, setLlmShown] = useState(false)
  const [llmBusy, setLlmBusy] = useState<'save' | 'test' | 'models' | 'clear' | null>(null)
  const [llmCheck, setLlmCheck] = useState<{ ok: boolean; text: string } | null>(null)
  const [llmModels, setLlmModels] = useState<string[]>([])
  const [info, setInfo] = useState<SystemInfo | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)
  const [infoLoading, setInfoLoading] = useState(false)
  const llmUserId = user?.id

  useEffect(() => {
    if (!llmUserId) return
    let active = true
    llmRequest<LlmSettingsView>('/v1/llm/settings')
      .then((next) => {
        if (!active) return
        setLlmSettings(next)
        if (next.baseUrl) {
          setLlmBaseUrl(next.baseUrl)
          setLlmProvider(providerFor(next.baseUrl))
        }
        if (next.model) setLlmModel(next.model)
      })
      .catch(() => {
        if (active) setLlmSettings(null)
      })
    return () => {
      active = false
    }
  }, [llmUserId])

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

  function chooseLlmProvider(id: string) {
    setLlmProvider(id)
    setLlmCheck(null)
    setLlmModels([])
    const preset = LLM_PRESETS.find((item) => item.id === id)
    if (!preset || preset.id === 'custom') return
    setLlmBaseUrl(preset.baseUrl)
    setLlmModel(preset.model)
  }

  async function reloadLlm() {
    const next = await llmRequest<LlmSettingsView>('/v1/llm/settings')
    setLlmSettings(next)
    if (next.baseUrl) {
      setLlmBaseUrl(next.baseUrl)
      setLlmProvider(providerFor(next.baseUrl))
    }
    if (next.model) setLlmModel(next.model)
    return next
  }

  async function saveLlm() {
    setLlmBusy('save')
    setLlmCheck(null)
    try {
      const next = await llmRequest<LlmSettingsView>('/v1/llm/settings', {
        method: 'POST',
        body: JSON.stringify({ baseUrl: llmBaseUrl, model: llmModel, apiKey: llmKey }),
      })
      setLlmSettings(next)
      setLlmKey('')
      notify('Настройки нейросети сохранены')
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Не удалось сохранить настройки')
    } finally {
      setLlmBusy(null)
    }
  }

  async function testLlm() {
    setLlmBusy('test')
    setLlmCheck(null)
    try {
      const result = await llmRequest<{ ok: boolean; text?: string; latencyMs?: number }>('/v1/llm/test', {
        method: 'POST',
        body: JSON.stringify({ baseUrl: llmBaseUrl, model: llmModel, apiKey: llmKey }),
      })
      setLlmCheck({
        ok: result.ok,
        text: result.text || (result.ok ? `Подключение работает${result.latencyMs ? `, ${result.latencyMs} мс` : ''}` : 'Не удалось проверить подключение'),
      })
    } catch (reason) {
      setLlmCheck({ ok: false, text: reason instanceof Error ? reason.message : 'Не удалось проверить подключение' })
    } finally {
      setLlmBusy(null)
    }
  }

  async function loadLlmModels() {
    setLlmBusy('models')
    try {
      const result = await llmRequest<{ ok: boolean; models: string[]; text?: string }>('/v1/llm/models', {
        method: 'POST',
        body: JSON.stringify({ baseUrl: llmBaseUrl, apiKey: llmKey }),
      })
      setLlmModels(result.models)
      notify(result.text ?? (result.ok ? 'Список моделей загружен' : 'Не удалось загрузить модели'))
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Не удалось загрузить модели')
    } finally {
      setLlmBusy(null)
    }
  }

  function llmStatus() {
    if (!llmSettings) return 'Не настроено'
    if (llmSettings.source === 'user') {
      return llmSettings.keyHint ? `Свой ключ ••••${llmSettings.keyHint}` : 'Своя модель без ключа'
    }
    if (llmSettings.source === 'env') {
      return `Общий ключ сервера${llmSettings.envModel ? ` · ${llmSettings.envModel}` : ''}`
    }
    return 'Не настроено'
  }

  async function openInfo() {
    setInfoOpen(true)
    if (info || infoLoading) return
    setInfoLoading(true)
    try {
      setInfo(await systemInfo())
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Не удалось получить сведения')
    } finally {
      setInfoLoading(false)
    }
  }

  function copyInfo() {
    if (!info) return
    const lines = [
      `Paralbook ${info.app.version}`,
      `Next.js ${info.app.next} · Node ${info.app.node} · ${info.app.env}`,
      `Сервис: ${info.service.url} — ${info.service.ok ? `доступен, ${info.service.latencyMs} мс, версия ${info.service.version ?? '—'}` : 'недоступен'}`,
      `Модель: ${llmSettings?.model ?? 'не настроена'}`,
      `Данные: текстов ${info.data.texts}, слов ${info.data.words}, освоено ${info.data.mastered}, прочитано ${info.data.read}`,
      `Словарь: лемм ${info.data.lemmas}`,
    ]
    void navigator.clipboard.writeText(lines.join('\n')).then(
      () => notify('Сведения скопированы'),
      () => notify('Не удалось скопировать'),
    )
  }

  async function removeLlm() {
    const ok = await confirm('Удалить личные настройки нейросети? Если задан общий ключ сервера, будет использоваться он.')
    if (!ok) return
    setLlmBusy('clear')
    try {
      await llmRequest('/v1/llm/settings', { method: 'DELETE' })
      setLlmBaseUrl('')
      setLlmModel('')
      setLlmKey('')
      setLlmModels([])
      setLlmCheck(null)
      setLlmProvider('custom')
      await reloadLlm()
      notify('Настройки нейросети удалены')
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Не удалось удалить настройки')
    } finally {
      setLlmBusy(null)
    }
  }

  return (
    <div>
      <header className="header">
        <button className="back" onClick={() => router.back()} aria-label="Назад">
          <ArrowLeft size={22} />
        </button>
        <h1>Настройки аккаунта</h1>
        <button className="icon-btn" aria-label="Справка о системе" onClick={() => void openInfo()}>
          <Info size={20} />
        </button>
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
        <div>
          <div className="row">
            <strong>Нейросеть</strong>
            <span className={`small ${llmSettings?.source === 'user' || llmSettings?.source === 'env' ? styles.ok : 'muted'}`}>{llmStatus()}</span>
          </div>
          <p className="small muted" style={{ margin: '6px 0 0' }}>Подходит любой сервис с OpenAI-совместимым API.</p>
          <div className="stack" style={{ gap: 10, marginTop: 10 }}>
            <label className="field">
              <span>Провайдер</span>
              <select className="input compact" value={llmProvider} onChange={(event) => chooseLlmProvider(event.target.value)}>
                {LLM_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Base URL</span>
              <input
                className="input compact"
                value={llmBaseUrl}
                placeholder="https://api.openai.com/v1"
                onChange={(event) => setLlmBaseUrl(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Модель</span>
              <input
                className="input compact"
                list="llm-models"
                value={llmModel}
                placeholder="gpt-4o-mini"
                onChange={(event) => setLlmModel(event.target.value)}
              />
              <datalist id="llm-models">
                {llmModels.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <span>API-ключ</span>
              <div className="input-wrap">
                <input
                  className="input compact"
                  type={llmShown ? 'text' : 'password'}
                  value={llmKey}
                  placeholder={llmSettings?.hasKey ? `Ключ сохранён${llmSettings.keyHint ? ` ••••${llmSettings.keyHint}` : ''} — оставьте пустым, чтобы не менять` : 'Ключ провайдера'}
                  onChange={(event) => setLlmKey(event.target.value)}
                />
                <button type="button" className="eye" onClick={() => setLlmShown((item) => !item)} aria-label="Показать API-ключ">
                  {llmShown ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
              </div>
            </label>
            {llmCheck ? <p className={`small ${llmCheck.ok ? styles.ok : styles.bad}`} style={{ margin: 0 }}>{llmCheck.text}</p> : null}
            {llmSettings && !llmSettings.tableReady ? (
              <p className="small muted" style={{ margin: 0 }}>Таблица llm_settings ещё не создана в Supabase — сохранение станет доступно после её добавления.</p>
            ) : null}
            <div className={styles.llmActions}>
              <button type="button" className="btn ghost slim" disabled={llmBusy !== null} onClick={() => void testLlm()}>
                {llmBusy === 'test' ? 'Проверяю…' : 'Проверить'}
              </button>
              <button type="button" className="btn slim" disabled={llmBusy !== null} onClick={() => void saveLlm()}>
                {llmBusy === 'save' ? 'Сохраняю…' : 'Сохранить'}
              </button>
            </div>
            <div className={styles.llmActions}>
              <button type="button" className="btn ghost slim" disabled={llmBusy !== null} onClick={() => void loadLlmModels()}>
                {llmBusy === 'models' ? 'Загружаю…' : 'Загрузить модели'}
              </button>
              <button
                type="button"
                className="btn danger slim"
                disabled={llmBusy !== null || llmSettings?.source !== 'user'}
                onClick={() => void removeLlm()}
              >
                {llmBusy === 'clear' ? 'Удаляю…' : 'Удалить настройки'}
              </button>
            </div>
            <p className="small muted" style={{ margin: 0 }}>Для локальных моделей ключ не нужен. На Vercel localhost указывает на сервер Vercel, а не на ваш компьютер.</p>
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
      {infoOpen ? (
        <div className="modal-dim" onClick={() => setInfoOpen(false)}>
          <div
            className={`modal ${styles.info}`}
            role="dialog"
            aria-modal="true"
            aria-label="Справка о системе"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.infoHead}>
              <h2>Справка о системе</h2>
              <button className="icon-btn" aria-label="Закрыть" onClick={() => setInfoOpen(false)}>
                <X size={18} />
              </button>
            </div>
            {infoLoading ? (
              <p className="muted">Собираю сведения…</p>
            ) : info ? (
              <div className={styles.infoBody}>
                <section>
                  <h3>Приложение</h3>
                  <Row label="Версия" value={info.app.version} />
                  <Row label="Next.js" value={info.app.next} />
                  <Row label="Node.js" value={info.app.node} />
                  <Row label="Режим" value={info.app.env} />
                </section>
                <section>
                  <h3>Сервис текстов</h3>
                  <Row label="Адрес" value={<span className={styles.mono}>{info.service.url}</span>} />
                  <Row label="Статус" value={info.service.ok ? `Доступен · ${info.service.latencyMs} мс` : 'Недоступен'} />
                  <Row label="Версия" value={info.service.version ?? '—'} />
                  <Row
                    label="Словарь"
                    value={info.service.lemmas ? `${info.service.lemmas.toLocaleString('ru-RU')} лемм` : '—'}
                  />
                </section>
                <section>
                  <h3>Нейросеть</h3>
                  <Row label="Модель" value={llmSettings?.model || '—'} />
                  <Row label="Ключ" value={llmStatus()} />
                </section>
                <section>
                  <h3>Ваши данные</h3>
                  <Row label="Уровень" value={user.cefr} />
                  <Row label="Серия" value={`${user.streak} дн.`} />
                  <Row label="Слов в словаре" value={info.data.words.toLocaleString('ru-RU')} />
                  <Row label="Освоено" value={info.data.mastered.toLocaleString('ru-RU')} />
                  <Row label="Текстов в подборке" value={info.data.texts.toLocaleString('ru-RU')} />
                  <Row label="Прочитано" value={info.data.read.toLocaleString('ru-RU')} />
                </section>
                <section>
                  <h3>Возможности</h3>
                  <Row label="Форматы" value="TXT, FB2, EPUB, DOCX, MD, .2books" />
                  <Row
                    label="Файл"
                    value={info.limits ? `до ${Math.round(info.limits.maxUploadBytes / 1024 / 1024)} МБ` : '—'}
                  />
                  <Row
                    label="Текст"
                    value={info.limits ? `до ${Math.round(info.limits.maxTranslateChars / 1000)} тыс. символов` : '—'}
                  />
                  <Row label="Скорость чтения" value="75 слов/мин" />
                </section>
                <p className="small muted" style={{ margin: 0 }}>
                  Подборка — ваши тексты. Библиотека — опубликованные тексты, видимые другим. Словарь хранит слова и
                  примеры из текста, тренировка повторяет их по расписанию.
                </p>
              </div>
            ) : (
              <p className="muted">Не удалось получить сведения.</p>
            )}
            <div className="actions">
              <button className="btn ghost" onClick={copyInfo} disabled={!info}>
                Скопировать сведения
              </button>
              <button className="btn" onClick={() => setInfoOpen(false)}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
