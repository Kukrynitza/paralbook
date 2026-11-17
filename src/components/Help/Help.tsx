'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import type { SystemInfo } from '@/sorse/types'
import styles from './Help.module.css'

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={styles.row}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  )
}

function Block({ title, open = false, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details className={styles.block} open={open}>
      <summary>{title}</summary>
      <div className={styles.blockBody}>{children}</div>
    </details>
  )
}

function Guide() {
  return (
    <div className={styles.guide}>
      <Block title="Что это" open>
        <p>
          Paralbook — читалка английских текстов с параллельным русским переводом. Вы читаете текст постранично,
          нажимаете на незнакомое слово и сразу видите перевод, а звёздочкой сохраняете слово в словарь. Сохранённые
          слова возвращаются в тренировке, пока вы их не запомните.
        </p>
      </Block>

      <Block title="С чего начать" open>
        <ol className={styles.steps}>
          <li>
            Добавьте текст: в «Подборке» нажмите «+», либо в «Чате» — «Добавить текст». Можно загрузить файл книги,
            вставить текст вручную или сгенерировать новый текст по теме.
          </li>
          <li>Откройте текст в «Подборке» и читайте страницу за страницей.</li>
          <li>Нажмите на слово — появится русское предложение с переводом; нажмите ещё раз — откроется карточка слова.</li>
          <li>Звёздочка в карточке сохраняет слово вместе с предложением из текста.</li>
          <li>Повторяйте слова: «Словарь» → «Тренировать».</li>
        </ol>
      </Block>

      <Block title="Где что находится">
        <ul className={styles.list}>
          <li>
            <b>Подборка</b> — ваши тексты, прогресс чтения, оценки, публикация и удаление.
          </li>
          <li>
            <b>Библиотека</b> — опубликованные тексты других людей: можно читать, ставить звёзды и добавлять себе.
          </li>
          <li>
            <b>Чат</b> — генерация текста по теме. Во фразе можно указать время («на 15 минут») и уровень (A2…C2).
            Здесь же кнопка «Добавить текст».
          </li>
          <li>
            <b>Словарь</b> — сохранённые слова, поиск, фильтры по статусу и наборам, запуск тренировки.
          </li>
          <li>
            <b>Тренировка</b> — карточки слов: «Учить», «Повторять» и «Смешанно». Дневной лимит новых слов задаётся
            там же.
          </li>
          <li>
            <b>Статистика</b> — график по дням и итоги за 7, 30, 90 дней, год и всё время.
          </li>
          <li>
            <b>Друзья</b> — добавляются по короткому коду; видно минуты чтения друг друга.
          </li>
          <li>
            <b>Настройки</b> — уровень, тема и цвета разделов, шрифты, ключ нейросети, размер порций перевода, эта
            справка и выход.
          </li>
        </ul>
      </Block>

      <Block title="Как читать">
        <ul className={styles.list}>
          <li>Текст разбит на страницы. Внизу — навигатор на 5 страниц и поле для перехода к номеру.</li>
          <li>
            Нажмите на слово: над текстом появится русское предложение и перевод. Второе нажатие открывает карточку с
            транскрипцией, озвучкой и звёздочкой.
          </li>
          <li>Звёздочка сохраняет слово и предложение, из которого оно взято.</li>
          <li>Прогресс сохраняется автоматически. На последней странице есть кнопка «Завершить».</li>
          <li>Кнопка со звуком в карточке произносит слово.</li>
        </ul>
      </Block>

      <Block title="Оформление">
        <ul className={styles.list}>
          <li>В настройках можно выбрать системную, светлую, тёмную или свою тему.</li>
          <li>Своя тема задаёт три цвета: фон, карточки и текст. Контраст проверяется автоматически.</li>
          <li>Каждому разделу можно назначить свой цвет — он виден по активной вкладке, кнопкам и прогрессу.</li>
          <li>Шрифты выбираются отдельно для интерфейса и для чтения; размер текста — S, M или L.</li>
        </ul>
      </Block>

      <Block title="Слова и тренировка">
        <ul className={styles.list}>
          <li>Слово проходит статусы «новое» → «учу» → «знаю»; выученные помечаются как освоенные.</li>
          <li>Сохранённое слово возвращается на повтор через увеличивающиеся интервалы.</li>
          <li>В тренировке можно ограничить число новых слов в день.</li>
          <li>Наборы слов по уровням A1…C2 предлагаются в настройках при смене уровня и запускаются из словаря.</li>
        </ul>
      </Block>

      <Block title="Как добавить текст">
        <ul className={styles.list}>
          <li>Файл: TXT, MD, FB2, EPUB, DOCX или `.2books`. Размер — до 30 МБ.</li>
          <li>
            Ручной ввод: только английский, только русский или оба текста. Если оба заполнены, система только
            соотнесёт их — перевод не нужен.
          </li>
          <li>
            Для ручного ввода название обязательно. Для файла можно оставить пустым — возьмём из метаданных или
            первого предложения.
          </li>
          <li>
            Перевод обязателен: без перевода текст не добавится. Без ключа доступны только `.2books` и ручная пара
            «английский + русский».
          </li>
          <li>Обработка идёт в фоне: можно уйти со страницы, прогресс останется в доке внизу.</li>
        </ul>
      </Block>

      <Block title="Нейросеть">
        <ul className={styles.list}>
          <li>Нейросеть нужна для перевода и генерации текста в чате.</li>
          <li>
            Подходит любой сервис с OpenAI-совместимым API: OpenAI, OpenRouter, DeepSeek, Groq, Mistral, Together,
            локальные Ollama и LM Studio.
          </li>
          <li>Ключ хранится зашифрованным и не попадает в браузер. В интерфейсе видно только последние 4 символа.</li>
          <li>«Проверить» делает короткий запрос, «Выбрать модель» показывает список моделей провайдера.</li>
          <li>Если свой ключ не указан, используется общий ключ сервера — когда он настроен.</li>
        </ul>
      </Block>

      <Block title="Ограничения">
        <div className={styles.rows}>
          <Row label="Файл" value="до 30 МБ" />
          <Row label="Текст или перевод" value="до 200 000 символов" />
          <Row label=".2books" value="до 4 МБ · 2000 страниц · 600 000 токенов" />
          <Row label="Минимум текста" value="20 символов" />
          <Row label="Страница" value="до 450 слов" />
          <Row label="Скорость чтения" value="75 слов в минуту" />
          <Row label="Генерация в чате" value="от 1 до 60 минут" />
        </div>
      </Block>

      <Block title="Если что-то не так">
        <ul className={styles.list}>
          <li>
            «Не указан API-ключ» — откройте «Настройки» → «Нейросеть», вставьте ключ и нажмите «Проверить».
          </li>
          <li>«Сервис обработки текста недоступен» — подождите и повторите позже.</li>
          <li>«Файл слишком большой» — разбейте книгу на части или загрузите `.2books`.</li>
          <li>«Уже есть активная задача» — дождитесь её завершения или остановите в доке внизу.</li>
          <li>Ошибки показываются в небольших карточках справа сверху и в доке задач.</li>
        </ul>
      </Block>

      <Block title="Данные">
        <ul className={styles.list}>
          <li>Тексты, слова и прогресс хранятся в вашем аккаунте.</li>
          <li>Опубликованный текст видят другие пользователи; убрать его из библиотеки нельзя.</li>
          <li>Ключ нейросети хранится в зашифрованном виде.</li>
        </ul>
      </Block>

      <p className={styles.footer}>
        Готовы начать? <Link href="/">Откройте подборку</Link> или <Link href="/text">добавьте текст</Link>.
      </p>
    </div>
  )
}

function System({
  info,
  loading,
  model,
  status,
}: {
  info: SystemInfo | null
  loading: boolean
  model: string
  status: string
}) {
  if (loading) return <p className="muted">Собираю сведения…</p>
  if (!info) return <p className="muted">Не удалось получить сведения.</p>
  return (
    <div className={styles.system}>
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
        <Row label="Словарь" value={info.service.lemmas ? `${info.service.lemmas.toLocaleString('ru-RU')} лемм` : '—'} />
      </section>
      <section>
        <h3>Нейросеть</h3>
        <Row label="Модель" value={model || '—'} />
        <Row label="Ключ" value={status} />
      </section>
      <section>
        <h3>Ваши данные</h3>
        <Row label="Текстов в подборке" value={info.data.texts.toLocaleString('ru-RU')} />
        <Row label="Слов в словаре" value={info.data.words.toLocaleString('ru-RU')} />
        <Row label="Освоено" value={info.data.mastered.toLocaleString('ru-RU')} />
        <Row label="Прочитано" value={info.data.read.toLocaleString('ru-RU')} />
      </section>
      <section>
        <h3>Возможности</h3>
        <Row label="Форматы" value="TXT, FB2, EPUB, DOCX, MD, .2books" />
        <Row label="Файл" value={info.limits ? `до ${Math.round(info.limits.maxUploadBytes / 1024 / 1024)} МБ` : 'до 30 МБ'} />
        <Row label="Текст" value={info.limits ? `до ${Math.round(info.limits.maxTranslateChars / 1000)} тыс. символов` : 'до 200 тыс. символов'} />
        <Row label="Скорость чтения" value="75 слов/мин" />
      </section>
    </div>
  )
}

export default function Help({
  info,
  loading,
  model,
  status,
  onCopy,
  onClose,
}: {
  info: SystemInfo | null
  loading: boolean
  model: string
  status: string
  onCopy: () => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<'guide' | 'system'>('guide')
  return (
    <div className="modal-dim" onClick={onClose}>
      <div
        className={`modal ${styles.modal}`}
        role="dialog"
        aria-modal="true"
        aria-label="Справка"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.head}>
          <h2>Справка</h2>
          <button className="icon-btn" aria-label="Закрыть" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className={styles.tabs}>
          <button type="button" className={tab === 'guide' ? 'chip on' : 'chip'} onClick={() => setTab('guide')}>
            Инструкция
          </button>
          <button type="button" className={tab === 'system' ? 'chip on' : 'chip'} onClick={() => setTab('system')}>
            О системе
          </button>
        </div>
        <div className={styles.body}>
          {tab === 'guide' ? <Guide /> : <System info={info} loading={loading} model={model} status={status} />}
        </div>
        <div className="actions">
          {tab === 'system' ? (
            <button className="btn ghost" onClick={onCopy} disabled={!info}>
              Скопировать сведения
            </button>
          ) : null}
          <button className="btn" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}
