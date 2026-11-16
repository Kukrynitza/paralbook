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

- `POST /v1/jobs/import/file` — загрузка файла (`TXT`, `FB2`, `EPUB`, `DOCX`, `.2books`); форма содержит `translate` и `language` (`auto`, `en`, `ru`).
- `POST /v1/jobs/import/text` — текст из формы: `text` (английский), `russian` (необязательный), `translate`. Если передан только один язык, сервис переводит его на второй; если оба — только выравнивает. Лимит — `MAX_TRANSLATE_CHARS` (200 000) на каждое поле.
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
