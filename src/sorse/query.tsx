import { sql, type Kysely, type Transaction } from 'kysely'
import type { Database } from '@/modules/database'
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

export async function ensureWord(db: Db, userId: string, lemma: string, countToday: boolean) {
  const known = await db
    .selectFrom('lemmas')
    .select(['lemma', 'hint'])
    .where('lemma', '=', lemma.toLowerCase())
    .executeTakeFirst()
  if (!known) throw new Error('Слова нет в словарной статье')
  const existing = await db
    .selectFrom('userWords')
    .select('id')
    .where('userId', '=', userId)
    .where('lemma', '=', known.lemma)
    .executeTakeFirst()
  if (existing) return existing.id
  const created = await db
    .insertInto('userWords')
    .values({ userId, lemma: known.lemma, hint: known.hint ?? '', correct: 0, wrong: 0, mastered: false })
    .returning('id')
    .executeTakeFirstOrThrow()
  if (countToday) await addActivity(db, userId, 0, 1)
  return created.id
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
      'lemmas.ipa',
      'lemmas.translation',
      'lemmas.example',
    ])
    .where('userWords.id', '=', itemId)
    .where('userWords.userId', '=', userId)
    .executeTakeFirst()
  if (!row) throw new Error('Слова нет в словаре')
  return {
    id: row.id,
    lemma: row.lemma,
    ipa: row.ipa,
    translation: row.translation,
    example: row.example,
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
    .select(['lemma', 'ipa', 'translation', 'example', 'hint'])
    .where('lemma', '=', lemma)
    .executeTakeFirst()
  if (!known) return null
  const word = await db
    .selectFrom('userWords')
    .select('hint')
    .where('userId', '=', userId)
    .where('lemma', '=', lemma)
    .executeTakeFirst()
  return {
    lemma: known.lemma,
    ipa: known.ipa,
    translation: known.translation,
    example: known.example,
    hint: word?.hint || known.hint,
  }
}
