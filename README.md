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

Оба значения только на сервере, в клиентский бандл они не попадают.

## Структура

- `src/app` — страницы
- `src/actions` — серверные действия, по одному файлу
- `src/components` — компоненты
- `src/sorse` — вспомогательные функции
- `src/modules/database.ts` — схема таблиц и подключение
- `src/contexts` — клиентское состояние
- `src/middleware.tsx` — проверка cookie сессии

## Словарь

Слово лежит в `lemmas`: перевод, транскрипция, короткий пример, частота в `rank`. Варианты перевода — в `senses`, примеры к ним — в `sense_examples`. Уровень CEFR — в `lemma_levels`.
