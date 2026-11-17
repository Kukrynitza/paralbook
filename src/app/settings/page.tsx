'use client'

import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  BarChart3,
  ChevronDown,
  Eye,
  EyeOff,
  GraduationCap,
  Info,
  Languages,
  LogOut,
  Palette,
  Sparkles,
  Type,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import { minLength, pipe, safeParse, string } from 'valibot'
import changePasswordAction from '@/actions/Profile/changePassword'
import systemInfo from '@/actions/Profile/systemInfo'
import updateMe from '@/actions/Profile/updateMe'
import seedVocabulary from '@/actions/Vocabulary/seedVocabulary'
import { GOALS, INTERESTS, LEVELS, type Cefr, type LlmSettingsView, type SystemInfo, type User } from '@/sorse/types'
import { useAuth, useUi } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { markSeedAsked } from '@/sorse/prefs'
import { llmRequest } from '@/sorse/llmClient'
import {
  DEFAULT_CHUNK,
  normalizeChunk,
  readChunkPrefs,
  requestsPer10k,
  writeChunkPrefs,
  type ChunkPrefs,
  type ChunkUnit,
} from '@/sorse/translationPrefs'
import { FONTS, READER_SIZES, READING_FONTS, UI_FONTS, type FontId, type ReaderSize } from '@/sorse/fonts'
import { paletteFor } from '@/sorse/themePrefs'
import { THEME_PRESETS, type ThemeMode } from '@/sorse/themeTypes'
import Help from '@/components/Help/Help'
import ThemeSheet from '@/components/ThemeSheet/ThemeSheet'
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

const MODES: { id: ThemeMode; label: string }[] = [
  { id: 'system', label: 'Системная' },
  { id: 'light', label: 'Светлая' },
  { id: 'dark', label: 'Тёмная' },
  { id: 'custom', label: 'Своя' },
]

const SIZES: { id: ReaderSize; label: string }[] = [
  { id: 's', label: 'S' },
  { id: 'm', label: 'M' },
  { id: 'l', label: 'L' },
]

type Tone = 'orange' | 'blue' | 'purple' | 'green' | 'pink' | 'slate'

function Card({
  icon: Icon,
  tone,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  icon: LucideIcon
  tone: Tone
  title: string
  summary?: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <section className={`${styles.card} ${styles[tone]}`}>
      <button type="button" className={styles.cardHead} onClick={onToggle} aria-expanded={open}>
        <span className={styles.cardIcon}>
          <Icon size={17} />
        </span>
        <span className={styles.cardTitle}>{title}</span>
        {summary ? <span className={styles.cardSummary}>{summary}</span> : null}
        <ChevronDown size={16} className={open ? `${styles.chev} ${styles.chevOn}` : styles.chev} />
      </button>
      {open ? <div className={styles.cardBody}>{children}</div> : null}
    </section>
  )
}

function providerFor(baseUrl: string) {
  return LLM_PRESETS.find((item) => item.baseUrl && item.baseUrl === baseUrl)?.id ?? 'custom'
}

export default function Page() {
  const { user, setUser, logout } = useAuth()
  const { confirm, notify, notifyError } = useUi()
  const { prefs, save, reset } = useTheme()
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
  const [themeOpen, setThemeOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [openCard, setOpenCard] = useState<string | null>('appearance')
  const llmUserId = user?.id

  useEffect(() => {
    if (!llmUserId) return
    let active = true
    llmRequest<LlmSettingsView>('/v1/llm/settings')
      .then((value) => {
        if (!active) return
        setLlmSettings(value)
        if (value.baseUrl) {
          setLlmBaseUrl(value.baseUrl)
          setLlmProvider(providerFor(value.baseUrl))
        }
        if (value.model) setLlmModel(value.model)
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
  const modeLabel = MODES.find((mode) => mode.id === prefs.mode)?.label ?? 'Системная'
  const preset = prefs.mode === 'custom'
    ? THEME_PRESETS.find(
        (item) =>
          item.palette.bg === prefs.custom.bg &&
          item.palette.surface === prefs.custom.surface &&
          item.palette.text === prefs.custom.text,
      )
    : undefined
  const appearanceSummary = prefs.mode === 'custom' ? `Своя · ${preset?.label ?? prefs.custom.bg}` : modeLabel
  const fontSummary = `${FONTS[prefs.fonts.ui].label} · ${FONTS[prefs.fonts.reading].label}`
  const fontPreview = {
    fontFamily: FONTS[prefs.fonts.reading].variable
      ? `var(${FONTS[prefs.fonts.reading].variable})`
      : 'system-ui',
  }

  function toggleCard(id: string) {
    setOpenCard((value) => (value === id ? null : id))
  }

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

  function chooseMode(mode: ThemeMode) {
    if (mode === 'custom') {
      save({ ...prefs, mode, custom: paletteFor(prefs) })
      return
    }
    save({ ...prefs, mode })
  }

  function chooseUiFont(id: FontId) {
    save({ ...prefs, fonts: { ...prefs.fonts, ui: id } })
  }

  function chooseReadingFont(id: FontId) {
    save({ ...prefs, fonts: { ...prefs.fonts, reading: id } })
  }

  function chooseSize(size: ReaderSize) {
    save({ ...prefs, fonts: { ...prefs.fonts, size } })
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
    if (next !== again) {
      setError('Пароли не совпадают')
      return
    }
    try {
      const result = await changePasswordAction({ current, next })
      if (result) {
        setError(result)
        return
      }
      setCurrent('')
      setNext('')
      setAgain('')
      setPasswordOpen(false)
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
    const value = await llmRequest<LlmSettingsView>('/v1/llm/settings')
    setLlmSettings(value)
    if (value.baseUrl) {
      setLlmBaseUrl(value.baseUrl)
      setLlmProvider(providerFor(value.baseUrl))
    }
    if (value.model) setLlmModel(value.model)
    return value
  }

  async function saveLlm() {
    setLlmBusy('save')
    setLlmCheck(null)
    try {
      const value = await llmRequest<LlmSettingsView>('/v1/llm/settings', {
        method: 'POST',
        body: JSON.stringify({ baseUrl: llmBaseUrl, model: llmModel, apiKey: llmKey }),
      })
      setLlmSettings(value)
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

  function patchChunk(nextValue: Partial<ChunkPrefs>) {
    const value = normalizeChunk(nextValue.unit ?? chunk.unit, nextValue.size ?? chunk.size)
    setChunk(value)
    writeChunkPrefs(value)
  }

  function chooseChunkUnit(unit: ChunkUnit) {
    patchChunk({ unit, size: unit === 'sentences' ? 3 : 1200 })
  }

  return (
    <div>
      <header className="header">
        <button className="back" onClick={() => router.back()} aria-label="Назад">
          <ArrowLeft size={22} />
        </button>
        <h1>Настройки</h1>
        <button className="icon-btn" aria-label="Справка" onClick={() => void openInfo()}>
          <Info size={20} />
        </button>
      </header>

      <div className="pad stack" style={{ gap: 12 }}>
        <Card
          icon={UserRound}
          tone="orange"
          title="Аккаунт"
          summary={user.email}
          open={openCard === 'account'}
          onToggle={() => toggleCard('account')}
        >
          <div className={styles.accountRow}>
            <span className="muted">Email</span>
            <b>{user.email}</b>
          </div>
          <button type="button" className="btn ghost slim" onClick={() => setPasswordOpen((value) => !value)}>
            {passwordOpen ? 'Скрыть смену пароля' : 'Изменить пароль'}
          </button>
          {passwordOpen ? (
            <form className="stack" style={{ gap: 10 }} onSubmit={changePassword}>
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
              <button className="btn slim">Сохранить пароль</button>
            </form>
          ) : null}
        </Card>

        <Card
          icon={GraduationCap}
          tone="green"
          title="Обучение"
          summary={`${user.cefr} · ${user.dailyGoalMin} мин`}
          open={openCard === 'learning'}
          onToggle={() => toggleCard('learning')}
        >
          <span className={styles.labelMuted}>Уровень английского</span>
          <div className="gap8">
            {LEVELS.map((level) => (
              <button key={level} className={user.cefr === level ? 'chip on' : 'chip'} onClick={() => void chooseLevel(level)}>
                {level}
              </button>
            ))}
          </div>
          <div className="row">
            <span className={styles.labelMuted}>Интересы</span>
            <span className="small muted">можно несколько</span>
          </div>
          <div className="gap8">
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
          <span className={styles.labelMuted}>Цель на день</span>
          <div className="gap8">
            {GOALS.map((goal) => (
              <button
                key={goal}
                className={user.dailyGoalMin === goal ? 'chip on' : 'chip'}
                onClick={() => void patch({ dailyGoalMin: goal })}
              >
                {goal} мин
              </button>
            ))}
          </div>
          <div className="row">
            <span className={styles.labelMuted}>Показывать друзьям минуты</span>
            <button
              className={user.showMinutes ? `${styles.toggle} ${styles.toggleOn}` : styles.toggle}
              onClick={() => void patch({ showMinutes: !user.showMinutes })}
              aria-label="Показывать минуты"
            >
              <i />
            </button>
          </div>
        </Card>

        <Card
          icon={Palette}
          tone="purple"
          title="Внешний вид"
          summary={`${appearanceSummary}`}
          open={openCard === 'appearance'}
          onToggle={() => toggleCard('appearance')}
        >
          <div className={styles.modes}>
            {MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={prefs.mode === mode.id ? 'chip on' : 'chip'}
                onClick={() => chooseMode(mode.id)}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <div className={styles.appearanceRow}>
            <span className={styles.dots}>
              <i style={{ background: 'var(--bg)' }} />
              <i style={{ background: 'var(--surface)' }} />
              <i style={{ background: 'var(--text)' }} />
            </span>
            <span className="small muted">Фон · карточки · текст</span>
          </div>
          <div className={styles.actionsRow}>
            <button className="btn slim" type="button" onClick={() => setThemeOpen(true)}>
              Настроить цвета
            </button>
            <button className="btn ghost slim" type="button" onClick={reset}>
              Сбросить
            </button>
          </div>
        </Card>

        <Card
          icon={Type}
          tone="blue"
          title="Шрифты"
          summary={fontSummary}
          open={openCard === 'fonts'}
          onToggle={() => toggleCard('fonts')}
        >
          <label className="field">
            <span>Интерфейс</span>
            <select className="input compact" value={prefs.fonts.ui} onChange={(event) => chooseUiFont(event.target.value as FontId)}>
              {UI_FONTS.map((id) => (
                <option key={id} value={id}>
                  {FONTS[id].label} — {FONTS[id].hint}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Чтение</span>
            <select className="input compact" value={prefs.fonts.reading} onChange={(event) => chooseReadingFont(event.target.value as FontId)}>
              {READING_FONTS.map((id) => (
                <option key={id} value={id}>
                  {FONTS[id].label} — {FONTS[id].hint}
                </option>
              ))}
            </select>
          </label>
          <div className="row">
            <span className={styles.labelMuted}>Размер текста · {READER_SIZES[prefs.fonts.size]}</span>
            <div className={styles.segSmall}>
              {SIZES.map((size) => (
                <button
                  key={size.id}
                  type="button"
                  className={prefs.fonts.size === size.id ? styles.on : ''}
                  onClick={() => chooseSize(size.id)}
                >
                  {size.label}
                </button>
              ))}
            </div>
          </div>
          <div
            className={styles.fontSample}
            style={{ ...fontPreview, fontSize: READER_SIZES[prefs.fonts.size] }}
          >
            <b>The morning was quiet.</b>
            <p>Утро было тихим, и озеро спало под туманом.</p>
          </div>
        </Card>

        <Card
          icon={Sparkles}
          tone="pink"
          title="Нейросеть"
          summary={llmStatus()}
          open={openCard === 'llm'}
          onToggle={() => toggleCard('llm')}
        >
          <p className="small muted" style={{ margin: 0 }}>
            Перевод и генерация в чате. Подходит любой сервис с OpenAI-совместимым API.
          </p>
          {llmSettings?.source === 'none' ? (
            <p className={`small ${styles.warn}`} style={{ margin: 0 }}>
              Без ключа не работают генерация в чате и перевод, а значит и добавление текстов.
            </p>
          ) : null}
          <div className="stack" style={{ gap: 10 }}>
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
                  placeholder={llmSettings?.hasKey ? `Ключ сохранён${llmSettings.keyHint ? ` ••••${llmSettings.keyHint}` : ''} — оставьте пустым` : 'Ключ провайдера'}
                  onChange={(event) => setLlmKey(event.target.value)}
                />
                <button type="button" className="eye" onClick={() => setLlmShown((item) => !item)} aria-label="Показать API-ключ">
                  {llmShown ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
              </div>
            </label>
          </div>
          {llmCheck ? <p className={`small ${llmCheck.ok ? styles.ok : styles.bad}`} style={{ margin: 0 }}>{llmCheck.text}</p> : null}
          {llmSettings && !llmSettings.tableReady ? (
            <p className="small muted" style={{ margin: 0 }}>
              Таблица llm_settings ещё не создана в Supabase — сохранение станет доступно после её добавления.
            </p>
          ) : null}
          <div className={styles.actionsRow}>
            <button type="button" className="btn soft slim" disabled={llmBusy !== null} onClick={() => void testLlm()}>
              {llmBusy === 'test' ? 'Проверяю…' : 'Проверить'}
            </button>
            <button type="button" className="btn slim" disabled={llmBusy !== null} onClick={() => void saveLlm()}>
              {llmBusy === 'save' ? 'Сохраняю…' : 'Сохранить'}
            </button>
          </div>
          <div className={styles.actionsRow}>
            <button type="button" className="btn ghost slim" disabled={llmBusy !== null} onClick={() => void loadLlmModels()}>
              {llmBusy === 'models' ? 'Запрашиваю…' : 'Выбрать модель'}
            </button>
            <button
              type="button"
              className={`btn ghost slim ${styles.dangerLink}`}
              disabled={llmBusy !== null || llmSettings?.source !== 'user'}
              onClick={() => void removeLlm()}
            >
              {llmBusy === 'clear' ? 'Удаляю…' : 'Удалить настройки'}
            </button>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Для локальных моделей ключ не нужен. На Vercel localhost указывает на сервер Vercel, а не на ваш компьютер.
          </p>
        </Card>

        <Card
          icon={Languages}
          tone="green"
          title="Перевод"
          summary={`${chunk.size} ${chunk.unit === 'tokens' ? 'ток.' : 'предл.'}`}
          open={openCard === 'chunk'}
          onToggle={() => toggleCard('chunk')}
        >
          <p className="small muted" style={{ margin: 0 }}>
            Сколько текста уходит в нейросеть за один запрос. Меньше — точнее, но больше запросов. Больше — быстрее
            и дешевле; для хорошей модели качество почти не падает.
          </p>
          <div className={styles.seg}>
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
          <p className="small muted" style={{ margin: 0 }}>
            ≈ {requestsPer10k(chunk)} запросов на 10 000 слов. Настройка хранится в этом браузере.
          </p>
        </Card>

        <Card
          icon={BarChart3}
          tone="slate"
          title="Данные и помощь"
          summary="статистика, справка"
          open={openCard === 'data'}
          onToggle={() => toggleCard('data')}
        >
          <div className={styles.actionsRow}>
            <Link className="btn ghost slim" href="/stats">
              Статистика недели
            </Link>
            <button type="button" className="btn ghost slim" onClick={() => void openInfo()}>
              Справка
            </button>
          </div>
        </Card>

        <section className={`${styles.card} ${styles.slate}`}>
          <div className={styles.logoutRow}>
            <div>
              <b>Выход</b>
              <p className="small muted">Завершить сеанс на этом устройстве</p>
            </div>
            <button
              className="btn danger slim"
              onClick={() => {
                logout()
                router.push('/login')
              }}
            >
              <LogOut size={15} />
              Выйти
            </button>
          </div>
        </section>
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

      {themeOpen ? <ThemeSheet onClose={() => setThemeOpen(false)} /> : null}

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
