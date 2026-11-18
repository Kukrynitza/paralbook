# Paralbook text-service

Python-сервис обработки текста: парсинг книг, страницы, токены, лемматизация,
выравнивание EN ↔ RU, LLM-генерация и перевод.

## Запуск

```bash
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python run.py
```

На Linux/macOS:

```bash
python -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python run.py
```

Сервис читает `.env` из корня репозитория и из `text-service/.env`
(второй имеет приоритет). Скопируйте `text-service/.env.example` в
`text-service/.env`, если хотите держать настройки сервиса отдельно.

На Windows `run.py` запускает `SelectorEventLoop` — это нужно для
`psycopg` в async-режиме. Не запускайте сервис через
`uvicorn app.main:app` на Windows.

## Что делает

- `POST /v1/jobs/import/file` — загрузка файла (`TXT`, `FB2`, `EPUB`, `DOCX`, `.2books`); форма содержит `translate`, `language` (`auto`, `en`, `ru`), `chunkUnit` (`sentences`/`tokens`) и `chunkSize`. Если в токене есть `jobId`, сервис забирает уже созданную задачу вместо создания новой.
- `POST /v1/jobs/import/text` — текст из формы: `text` (английский), `russian` (необязательный), `translate`, `chunkUnit`, `chunkSize`. Если передан только один язык, сервис переводит его на второй; если оба — только выравнивает. Лимит — `MAX_TRANSLATE_CHARS` (200 000) на каждое поле.
- Текст без перевода не сохраняется: если LLM-ключ не настроен и пара «английский + русский» не передана, задача завершается ошибкой. Английский файл длиннее `MAX_TRANSLATE_CHARS` тоже отклоняется — нужен `.2books` с готовым переводом или разбиение на части. Исключения: `.2books` и ручной ввод с обоими полями.
- `POST /v1/jobs/{id}/cancel` — останавливает asyncio-задачу и помечает её `cancelled`; статус не перезаписывается завершением.
- `POST /v1/jobs/chat` — генерация текста для чата.
- `GET /v1/jobs/{id}` — статус и прогресс.
- `GET /v1/llm/settings` — настройки LLM пользователя (ключ замаскирован).
- `POST /v1/llm/settings` — сохранить LLM-настройки.
- `POST /v1/llm/test` — проверить ключ.
- `POST /v1/llm/models` — список моделей.
- `GET /health` — состояние и размеры словаря.

Пользовательские ключи шифруются AES-256-GCM. Секрет
`LLM_SETTINGS_SECRET` есть только у сервиса. Старые ключи `v1`,
зашифрованные Next, автоматически перешифровываются при чтении, если
задан `LLM_LEGACY_SECRET`.

## БД

При старте сервис создаёт таблицу `text_jobs`, если её нет.
Остальные таблицы (`texts`, `pages`, `en_tokens`, `ru_tokens`,
`llm_settings`) должны уже существовать.

Для фонового импорта у `texts` должна быть колонка:

```sql
alter table texts add column if not exists ready boolean not null default true;
```

Для точной подсветки перевода у `en_tokens` нужна колонка:

```sql
alter table en_tokens add column if not exists ru_align integer;
```

Сервис добавляет её сам при старте, если таблица уже существует.

`ru_align` — индекс русского слова в пределах страницы. Сначала ищется ближайшее вхождение словарного перевода, для служебных слов (`is`, `a`, `the` и т. п.) сразу берётся ближайшая позиция, чтобы подсветка не улетала в другой конец страницы. Если перевода на странице нет, тоже ставится ближайшая позиция; `null` остаётся только у пробелов и пунктуации.

Если нужен ручной SQL:

```sql
create table if not exists text_jobs (
  id uuid primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  text_id uuid references texts(id) on delete cascade,
  type text not null,
  status text not null,
  stage text,
  progress integer not null default 0,
  error text,
  payload jsonb,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## Проверка

```bash
curl http://127.0.0.1:8000/health
```

Затем в Next.js должны быть те же значения:

```env
TEXT_SERVICE_URL=http://127.0.0.1:8000
NEXT_PUBLIC_TEXT_SERVICE_URL=http://127.0.0.1:8000
TEXT_SERVICE_TOKEN=...
TEXT_SERVICE_JWT_SECRET=...
```
