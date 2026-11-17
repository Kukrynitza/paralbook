'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Eye, EyeOff, Info, X } from 'lucide-react'
import { minLength, pipe, safeParse, string } from 'valibot'
import changePasswordAction from '@/actions/Profile/changePassword'
import systemInfo from '@/actions/Profile/systemInfo'
import updateMe from '@/actions/Profile/updateMe'
import seedVocabulary from '@/actions/Vocabulary/seedVocabulary'
import { GOALS, INTERESTS, LEVELS, type Cefr, type LlmSettingsView, type SystemInfo, type ThemePref, type User } from '@/sorse/types'
import { useAuth, useUi } from '@/contexts/AuthContext'
import { markSeedAsked } from '@/sorse/prefs'
import { llmRequest } from '@/sorse/llmClient'
import { DEFAULT_CHUNK, normalizeChunk, readChunkPrefs, requestsPer10k, writeChunkPrefs, type ChunkPrefs, type ChunkUnit } from '@/sorse/translationPrefs'
import Help from '@/components/Help/Help'
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

export default function Page() {
  const { user, setUser, logout } = useAuth()
  const { confirm, notify, notifyError } = useUi()
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
  const [modelsOpen, setModelsOpen] = useState(false)
  const [modelQuery, setModelQuery] = useState('')
  const [chunk, setChunk] = useState<ChunkPrefs>(DEFAULT_CHUNK)
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

  useEffect(() => {
    setChunk(readChunkPrefs())
  }, [])

  if (!user) return null

  const modelChoices = llmModels.filter((item) => !/embed|whisper|tts|dall-e|stable-diffusion|moderation|rerank/i.test(item))
  const modelFilter = modelQuery.trim().toLowerCase()
  const filteredModels = modelFilter
    ? modelChoices.filter((item) => item.toLowerCase().includes(modelFilter))
    : modelChoices
  const shownModels = filteredModels.slice(0, 200)

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

  function patchChunk(next: Partial<ChunkPrefs>) {
    const value = normalizeChunk(next.unit ?? chunk.unit, next.size ?? chunk.size)
    setChunk(value)
    writeChunkPrefs(value)
  }

  function chooseChunkUnit(unit: ChunkUnit) {
    patchChunk({ unit, size: unit === 'sentences' ? 3 : 1200 })
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
      notifyError(reason instanceof Error ? reason.message : 'Не удалось сохранить настройки')
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
      if (!result.ok || !result.models.length) {
        notify(result.text || 'Провайдер не вернул список моделей')
        return
      }
      setModelQuery('')
      setModelsOpen(true)
    } catch (reason) {
      notifyError(reason instanceof Error ? reason.message : 'Не удалось загрузить модели')
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
      notifyError(reason instanceof Error ? reason.message : 'Не удалось получить сведения')
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
      notifyError(reason instanceof Error ? reason.message : 'Не удалось удалить настройки')
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
        <button className="icon-btn" aria-label="Справка" onClick={() => void openInfo()}>
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
          {llmSettings?.source === 'none' ? (
            <p className={`small ${styles.warn}`} style={{ margin: '4px 0 0' }}>
              Без ключа не работают генерация в чате и перевод, а значит и добавление текстов.
            </p>
          ) : null}
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
                value={llmModel}
                placeholder="gpt-4o-mini"
                onChange={(event) => setLlmModel(event.target.value)}
              />
              <span className="muted">Можно вписать вручную или выбрать из списка провайдера</span>
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
                {llmBusy === 'models' ? 'Запрашиваю…' : 'Выбрать модель'}
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
        <div>
          <strong>Размер блока перевода</strong>
          <p className="small muted" style={{ margin: '6px 0 0' }}>
            Сколько текста уходит в нейросеть за один запрос. Меньше — точнее, но больше запросов. Больше — быстрее
            и дешевле; для хорошей модели качество почти не падает.
          </p>
          <div className={styles.seg} style={{ marginTop: 8 }}>
            <button type="button" className={chunk.unit === 'tokens' ? styles.on : ''} onClick={() => chooseChunkUnit('tokens')}>
              Токены
            </button>
            <button type="button" className={chunk.unit === 'sentences' ? styles.on : ''} onClick={() => chooseChunkUnit('sentences')}>
              Предложения
            </button>
          </div>
          <div className={styles.rangeRow}>
            <input
              className={styles.range}
              type="range"
              min={chunk.unit === 'tokens' ? 300 : 1}
              max={chunk.unit === 'tokens' ? 4000 : 20}
              step={chunk.unit === 'tokens' ? 100 : 1}
              value={chunk.size}
              onChange={(event) => patchChunk({ size: Number(event.target.value) })}
            />
            <b>
              {chunk.size} {chunk.unit === 'tokens' ? 'ток.' : 'предл.'}
            </b>
          </div>
          <p className="small muted" style={{ margin: '4px 0 0' }}>
            ≈ {requestsPer10k(chunk)} запросов на 10 000 слов. Настройка хранится в этом браузере.
          </p>
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
      {modelsOpen ? (
        <div className="modal-dim" onClick={() => setModelsOpen(false)}>
          <div
            className={`modal ${styles.models}`}
            role="dialog"
            aria-modal="true"
            aria-label="Выбор модели"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modelHead}>
              <h2>Выбор модели</h2>
              <button className="icon-btn" aria-label="Закрыть" onClick={() => setModelsOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <input
              className="input compact"
              autoFocus
              placeholder="Поиск: openai/, gpt-4o, claude"
              value={modelQuery}
              onChange={(event) => setModelQuery(event.target.value)}
            />
            <div className={styles.modelCount}>
              {filteredModels.length} моделей
              {shownModels.length < filteredModels.length ? ` · показано ${shownModels.length}` : ''}
            </div>
            <div className={styles.modelList}>
              {shownModels.map((model) => (
                <button
                  key={model}
                  type="button"
                  className={model === llmModel ? `${styles.model} ${styles.modelOn}` : styles.model}
                  onClick={() => {
                    setLlmModel(model)
                    setModelsOpen(false)
                  }}
                >
                  {model}
                </button>
              ))}
              {filteredModels.length ? null : (
                <p className="small muted" style={{ margin: 0 }}>
                  Ничего не найдено
                </p>
              )}
            </div>
            <p className="small muted" style={{ margin: '8px 0 0' }}>
              Список приходит от провайдера. Ничего не скачивается.
            </p>
            <div className="actions">
              <button className="btn" onClick={() => setModelsOpen(false)}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {infoOpen ? (
        <Help
          info={info}
          loading={infoLoading}
          model={llmSettings?.model ?? ''}
          status={llmStatus()}
          onCopy={copyInfo}
          onClose={() => setInfoOpen(false)}
        />
      ) : null}
    </div>
  )
}
