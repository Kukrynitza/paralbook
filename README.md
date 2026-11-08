# Paralbook

Чтение английских текстов: подборка, библиотека, генерация в чате, карточка слова по второму клику, словарь и тренировка.

## Стек

Next.js 15, React 19, Kysely, PostgreSQL. База — Supabase через session pooler. Вход свой: пароль в `scrypt`, сессия в httpOnly-cookie. Supabase Auth не используется.

## Запуск

```bash
npm install
```

Скопируйте `.env.example` в `.env` и подставьте свои значения.

```bash
npm run dev
```

Приложение откроется на http://localhost:5173.

Сборка: `npm run build`, затем `npm start`.

## Переменные

`DATABASE_CONNECTION_STRING` — строка session pooler (`*.pooler.supabase.com:5432`). Прямой хост `db.*.supabase.co` с Vercel не открывается.

`JWT_SECRET_KEY` — длинная случайная строка для подписи сессии.

`LLM_SETTINGS_SECRET` — длинная случайная строка для шифрования ключей пользователей. Если не задана, используется `JWT_SECRET_KEY`.

`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_CHAT_MODEL` — общая модель по умолчанию. Используется, если у пользователя нет личных настроек.

Все значения только на сервере, в клиентский бандл они не попадают.

## Нейросеть

Пользователь может указать свой OpenAI-совместимый сервис в настройках: Base URL, модель и API-ключ. Ключ хранится зашифрованным (AES-256-GCM) в таблице `llm_settings`, на клиент не возвращается. Кнопка «Проверить» делает небольшой тестовый запрос к модели.

Таблицу нужно создать в Supabase один раз (тип `user_id` должен совпадать с `profiles.id`; ниже предполагается `uuid`):

```sql
create table if not exists llm_settings (
  user_id uuid primary key references profiles(id) on delete cascade,
  base_url text not null,
  model text not null,
  api_key_ciphertext text,
  updated_at timestamptz not null default now()
);
```

Пока таблицы нет, приложение продолжает работать на общей модели из `.env`. Для локальных моделей (Ollama, LM Studio) ключ не обязателен, но адрес `localhost` доступен только если приложение запущено на той же машине.

## Структура

- `src/app` — страницы
- `src/actions` — серверные действия, по одному файлу
- `src/components` — компоненты
- `src/sorse` — вспомогательные функции
- `src/modules/database.ts` — схема таблиц и подключение
- `src/contexts` — клиентское состояние
- `src/middleware.tsx` — проверка cookie сессии

## Словарь

Слово лежит в `lemmas`: перевод, транскрипция, короткий пример, частота в `rank`, уровень CEFR в `level`. Варианты перевода — в `senses` (`pos`, `text`, `source`). Пример перевода — в `sense_examples` (`text_en`, `text_ru`) и ссылается на конкретное значение. Клик по форме слова ищет лемму в `word_forms`.
