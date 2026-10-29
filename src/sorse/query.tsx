import { sql, type Kysely, type Transaction } from 'kysely'
import type { Database } from '@/modules/database'
import solver from '@/sorse/solver'
import type { Friend, LibraryItem, SessionCard, VocabItem } from '@/sorse/types'

export const PAGE_SIZE = 4

type Db = Kysely<Database> | Transaction<Database>

export function pageOf<T>(items: T[], page: number) {
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const current = Math.min(pages, Math.max(1, page || 1))
  const start = (current - 1) * PAGE_SIZE
  return { page: current, pages, total: items.length, items: items.slice(start, start + PAGE_SIZE) }
}

export function ratingOf(base: number | string, likes: number, dislikes: number) {
  const value = Number(base) + likes * 0.1 - dislikes * 0.1
  const clamped = Math.min(5, Math.max(0, value))
  return Math.round(clamped * 10) / 10
}

export function displayName(email: string) {
  const local = email.split('@')[0] || email
  return local.charAt(0).toUpperCase() + local.slice(1)
}

export function dayKey(value: Date | string) {
  if (typeof value === 'string') return value.slice(0, 10)
  return value.toISOString().slice(0, 10)
}

export function recentDays() {
  const labels = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
  const now = new Date()
  return Array.from({ length: 7 }, (_, index) => {
    const offset = 6 - index
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset))
    return { key: date.toISOString().slice(0, 10), label: labels[date.getUTCDay()] }
  })
}

export function streakCount(days: string[], today: string) {
  const unique = [...new Set(days)].sort().reverse()
  if (!unique.length || !today) return 0
  const start = unique[0]
  const yesterday = shiftDay(today, -1)
  if (start !== today && start !== yesterday) return 0
  const seen = new Set(unique)
  let cursor = start
  let count = 0
  while (seen.has(cursor)) {
    count += 1
    cursor = shiftDay(cursor, -1)
  }
  return count
}

function shiftDay(iso: string, delta: number) {
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + delta)
  return date.toISOString().slice(0, 10)
}

export async function touchStreak(db: Db, userId: string) {
  const todayRow = await sql<{ day: string }>`select current_date::text as day`.execute(db)
  const today = String(todayRow.rows[0]?.day ?? '').slice(0, 10)
  const rows = await db.selectFrom('activityDays').select(['day', 'minutes', 'words']).where('userId', '=', userId).execute()
  const days = rows.filter((row) => Number(row.minutes) > 0 || Number(row.words) > 0).map((row) => dayKey(row.day))
  const streak = streakCount(days, today)
  await db.updateTable('profiles').set({ streak }).where('id', '=', userId).execute()
  return streak
}

export async function addActivity(db: Db, userId: string, minutes: number, words: number) {
  if (!minutes && !words) return
  await db
    .insertInto('activityDays')
    .values({
      userId,
      day: sql`current_date`,
      minutes,
      words,
    })
    .onConflict((conflict) =>
      conflict.columns(['userId', 'day']).doUpdateSet({
        minutes: sql`activity_days.minutes + ${minutes}`,
        words: sql`activity_days.words + ${words}`,
      }),
    )
    .execute()
  await touchStreak(db, userId)
}

export async function todayActivity(db: Db, userId: string) {
  const row = await db
    .selectFrom('activityDays')
    .select(['minutes', 'words'])
    .where('userId', '=', userId)
    .where(sql<boolean>`day = current_date`)
    .executeTakeFirst()
  return { minutes: Number(row?.minutes ?? 0), words: Number(row?.words ?? 0) }
}

export async function friendsOf(db: Db, userId: string): Promise<Friend[]> {
  const rows = await db
    .selectFrom('friendships')
    .innerJoin('profiles', 'profiles.id', 'friendships.friendId')
    .select(['profiles.id', 'profiles.email', 'profiles.showMinutes', 'profiles.streak'])
    .where('friendships.userId', '=', userId)
    .orderBy('friendships.createdAt', 'asc')
    .execute()
  if (!rows.length) return []
  const activity = await db
    .selectFrom('activityDays')
    .select(['userId', 'minutes'])
    .where('userId', 'in', rows.map((item) => item.id))
    .where(sql<boolean>`day = current_date`)
    .execute()
  const minutes = new Map(activity.map((item) => [item.userId, Number(item.minutes)]))
  return rows.map((item) => {
    const today = minutes.get(item.id) ?? 0
    const shown = item.showMinutes ? today : 0
    return {
      id: item.id,
      name: displayName(item.email),
      minutesToday: shown,
      minutesLabel: item.showMinutes ? (shown > 0 ? `${shown} мин` : 'Ещё не занимался') : 'Минуты скрыты',
      streak: item.streak,
    }
  })
}

export function vocabTone(correct: number, wrong: number): VocabItem['tone'] {
  return correct > wrong ? 'ok' : 'error'
}

export async function libraryCard(db: Db, userId: string, textId: string): Promise<LibraryItem> {
  const text = await db
    .selectFrom('texts')
    .select(['id', 'title', 'excerpt', 'minutes', 'level', 'topic', 'baseRating', 'published', 'createdAt'])
    .where('id', '=', textId)
    .executeTakeFirst()
  if (!text || !text.published) throw new Error('Текст не опубликован')
  const votes = await db.selectFrom('votes').select('value').where('textId', '=', textId).execute()
  const mine = await db
    .selectFrom('votes')
    .select('value')
    .where('textId', '=', textId)
    .where('userId', '=', userId)
    .executeTakeFirst()
  const saved = await db
    .selectFrom('collectionItems')
    .select('id')
    .where('textId', '=', textId)
    .where('userId', '=', userId)
    .executeTakeFirst()
  const likes = votes.filter((item) => item.value === 'like').length
  const dislikes = votes.length - likes
  return {
    id: text.id,
    title: text.title,
    excerpt: text.excerpt,
    minutes: text.minutes,
    level: text.level,
    topic: text.topic,
    rating: ratingOf(text.baseRating, likes, dislikes),
    vote: mine?.value ?? null,
    saved: Boolean(saved),
    createdAt: new Date(text.createdAt).toISOString(),
  }
}

export async function ensureWord(
  _db: Db,
  userId: string,
  lemma: string,
  countToday: boolean,
  extra?: {
    contextEn?: string | null
    contextRu?: string | null
    senseId?: string | null
    disagreement?: boolean
  },
) {
  const saved = await solver<{ id: string }>('/vocabulary', {
    userId,
    lemma,
    countToday,
    senseId: extra?.senseId ?? null,
    contextEn: extra?.contextEn ?? null,
    contextRu: extra?.contextRu ?? null,
    disagreement: extra?.disagreement ?? null,
  })
  return saved.id
}

export async function vocabById(db: Db, userId: string, itemId: string): Promise<VocabItem> {
  const row = await db
    .selectFrom('userWords')
    .innerJoin('lemmas', 'lemmas.lemma', 'userWords.lemma')
    .select([
      'userWords.id',
      'userWords.lemma',
      'userWords.hint',
      'userWords.correct',
      'userWords.wrong',
      'userWords.mastered',
      'userWords.contextEn',
      'lemmas.ipa',
      'lemmas.translation',
      'lemmas.example',
    ])
    .where('userWords.id', '=', itemId)
    .where('userWords.userId', '=', userId)
    .executeTakeFirst()
  if (!row) throw new Error('Слова нет в словаре')
  const memory = (await solver<{ memory: string | null }>(`/memory?lemma=${encodeURIComponent(row.lemma)}`)).memory
  return {
    id: row.id,
    lemma: row.lemma,
    ipa: row.ipa,
    translation: row.translation,
    example: row.contextEn || row.example,
    contextEn: row.contextEn,
    memory,
    hint: row.hint,
    correct: row.correct,
    wrong: row.wrong,
    mastered: row.mastered,
    tone: vocabTone(row.correct, row.wrong),
  }
}

export async function cardOf(db: Db, userId: string, lemma: string): Promise<SessionCard | null> {
  const known = await db
    .selectFrom('lemmas')
    .select(['lemma', 'ipa', 'translation', 'example', 'hint', 'level', 'rank'])
    .where('lemma', '=', lemma)
    .executeTakeFirst()
  if (!known) return null
  const word = await db
    .selectFrom('userWords')
    .select(['hint', 'contextEn', 'senseId', 'correct'])
    .where('userId', '=', userId)
    .where('lemma', '=', lemma)
    .executeTakeFirst()
  const sense = word?.senseId
    ? await db.selectFrom('senses').select(['text', 'pos']).where('id', '=', word.senseId).executeTakeFirst()
    : await db.selectFrom('senses').select(['text', 'pos']).where('lemma', '=', known.lemma).orderBy('position', 'asc').executeTakeFirst()
  const rawTranslation = word?.senseId ? sense?.text || known.translation : known.translation
  const baseName = formBase(rawTranslation)
  const base =
    baseName && baseName !== known.lemma
      ? await db.selectFrom('lemmas').select('translation').where('lemma', '=', baseName).executeTakeFirst()
      : undefined
  const baseTranslation = base?.translation && !formBase(base.translation) ? base.translation : null
  const note = baseName && baseName !== known.lemma ? formCaption(rawTranslation || '', baseName) : null
  const rows = await db
    .selectFrom('senseExamples')
    .innerJoin('senses', 'senses.id', 'senseExamples.senseId')
    .select(['senses.id as senseId', 'senseExamples.textEn', 'senseExamples.textRu'])
    .where('senses.lemma', '=', known.lemma)
    .orderBy('senses.position', 'asc')
    .orderBy('senseExamples.position', 'asc')
    .execute()
  const ordered = word?.senseId
    ? [...rows.filter((row) => row.senseId === word.senseId), ...rows.filter((row) => row.senseId !== word.senseId)]
    : rows
  const seen = new Map<string, number>()
  const examples: { textEn: string; textRu: string | null }[] = []
  for (const row of ordered) {
    const count = seen.get(row.senseId) ?? 0
    if (count >= 2 || examples.length >= 6) continue
    seen.set(row.senseId, count + 1)
    examples.push({ textEn: row.textEn, textRu: row.textRu })
  }
  if (!examples.length && known.example) examples.push({ textEn: known.example, textRu: null })
  return {
    lemma: known.lemma,
    display: note || sense?.pos !== 'гл.' ? known.lemma : `to ${known.lemma}`,
    ipa: known.ipa,
    translation: note ? baseTranslation : rawTranslation,
    example: word?.contextEn || known.example,
    hint: word?.hint || known.hint,
    note,
    pos: sense?.pos ?? null,
    level: known.level,
    band: bandOf(known.rank),
    review: word?.correct ?? 0,
    examples,
  }
}

function formBase(text: string | null | undefined) {
  const value = text?.trim() || ''
  if (!/^форма\s/i.test(value)) return null
  const found = value.match(/([A-Za-z][A-Za-z'-]*)$/)
  return found ? found[1].toLowerCase() : null
}

function formCaption(text: string, base: string) {
  const value = text.toLowerCase()
  if (value.includes('прошедш')) return `прошедшее время от ${base}`
  if (value.includes('множествен')) return `множественное число от ${base}`
  if (value.includes('причасти')) return `причастие от ${base}`
  if (value.includes('косвен')) return `косвенная форма от ${base}`
  return `форма от ${base}`
}

function bandOf(rank: number | null | undefined) {
  if (!rank || rank < 1 || rank > 3000) return null
  if (rank <= 100) return '1–100'
  if (rank <= 1000) return '101–1000'
  return '1001–3000'
}
