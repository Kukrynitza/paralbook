# Paralbook

Чтение английских текстов: подборка, библиотека, генерация в чате, карточка слова по второму клику, словарь и тренировка.

## Стек

Next.js 15, React 19, Kysely, PostgreSQL. База — Supabase через session pooler. Вход свой: пароль в `scrypt`, сессия в httpOnly-cookie. Supabase Auth не используется.

## Запуск

```bash
npm install
python3 -m venv solver/.venv
solver/.venv/bin/pip install -r solver/requirements.txt
```

Скопируйте `.env.example` в `.env` и подставьте свои значения. Решатель читает тот же `.env`.

Нужны **два** процесса. Сайт — http://localhost:5173, решатель сам по себе на порту 8000 (это API, не страница).

Одной командой из каталога `paralbook`:

```bash
cd ~/Desktop/BSUIR_LABS/course-4-1/paralbook
npm run dev:all
```

Или в двух терминалах, оба из `paralbook` (не из `~`):

```bash
cd ~/Desktop/BSUIR_LABS/course-4-1/paralbook
npm run solver
```

```bash
cd ~/Desktop/BSUIR_LABS/course-4-1/paralbook
npm run dev
```

Приложение откроется на http://localhost:5173. Решатель — на порту 8000.

Сборка: `npm run build`, затем `npm start`. Проверка решателя: `npm run smoke`.

## Переменные

`DATABASE_CONNECTION_STRING` — строка session pooler (`*.pooler.supabase.com:5432`). Прямой хост `db.*.supabase.co` с Vercel не открывается.

`JWT_SECRET_KEY` — длинная случайная строка для подписи сессии.

`SOLVER_URL` — адрес Python-решателя. По умолчанию `http://127.0.0.1:8000`.

`LLM_API_KEY` — ключ OpenAI-совместимого API. Без него чат собирает текст только из загруженных фрагментов, а смысл слова выбирается по базе знаний.

`LLM_BASE_URL` — по умолчанию `https://api.openai.com/v1`.

`LLM_CHAT_MODEL` и `LLM_EMBED_MODEL` — имена моделей чата и эмбеддингов. `LLM_EMBED_MODEL=off` отключает эмбеддинги, поиск идёт по словам.

Оба значения только на сервере, в клиентский бандл они не попадают.

## Структура

- `solver` — смысл слова, карточки, этимология, загрузка и сборка текста
- `src/app` — страницы
- `src/actions` — серверные действия, по одному файлу
- `src/components` — компоненты
- `src/sorse` — вспомогательные функции
- `src/modules/database.ts` — схема таблиц и подключение
- `src/contexts` — клиентское состояние
- `src/middleware.tsx` — проверка cookie сессии

## Словарь

Слово лежит в `lemmas`: перевод, транскрипция, короткий пример, частота в `rank`, уровень CEFR в `level`. Варианты перевода — в `senses` (`pos`, `text`, `source`). Пример перевода — в `sense_examples` (`text_en`, `text_ru`) и ссылается на конкретное значение. Клик по форме слова ищет лемму в `word_forms`.
