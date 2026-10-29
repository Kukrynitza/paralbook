import { sql, type Kysely, type Transaction } from 'kysely'
import type { Database } from '@/modules/database'
import { shortHint } from '@/sorse/hint'
import type { Friend, SessionCard, VocabItem } from '@/sorse/types'

type Db = Kysely<Database> | Transaction<Database>

export function pageWindow(total: number, page: number, size: number) {
  const pages = Math.max(1, Math.ceil(total / size))
  const current = Math.min(pages, Math.max(1, page || 1))
  return { page: current, pages, total, offset: (current - 1) * size }
}

export function averageScore(scores: number[]) {
  if (!scores.length) return null
  const value = scores.reduce((sum, item) => sum + item, 0) / scores.length
  return Math.round(value * 10) / 10
}

export function displayName(email: string) {
  const local = email.split('@')[0] || email
  return local.charAt(0).toUpperCase() + local.slice(1)
}

export function dayKey(value: Date | string) {
  if (typeof value === 'string') return value.slice(0, 10)
  return value.toISOString().slice(0, 10)
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
    .values({
      userId,
      lemma: known.lemma,
      hint: shortHint(known.hint ?? ''),
      correct: 0,
      wrong: 0,
      mastered: false,
      dueAt: sql`now()`,
      intervalDays: 0,
      ease: 2.5,
    })
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
    contextEn: null,
    memory: null,
    hint: row.hint,
    correct: row.correct,
    wrong: row.wrong,
    mastered: row.mastered,
    tone: vocabTone(row.correct, row.wrong),
  }
}

function bandOf(rank: number) {
  if (rank >= 1 && rank <= 100) return '1–100'
  if (rank <= 1000) return '101–1000'
  if (rank <= 3000) return '1001–3000'
  return null
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
    .select(['hint', 'correct'])
    .where('userId', '=', userId)
    .where('lemma', '=', lemma)
    .executeTakeFirst()
  const sense = await db
    .selectFrom('senses')
    .select('pos')
    .where('lemma', '=', known.lemma)
    .orderBy('position', 'asc')
    .executeTakeFirst()
  const examples = await db
    .selectFrom('senseExamples')
    .innerJoin('senses', 'senses.id', 'senseExamples.senseId')
    .select(['senseExamples.textEn', 'senseExamples.textRu'])
    .where('senses.lemma', '=', known.lemma)
    .orderBy('senses.position', 'asc')
    .orderBy('senseExamples.position', 'asc')
    .limit(6)
    .execute()
  return {
    lemma: known.lemma,
    display: known.lemma,
    ipa: known.ipa,
    translation: known.translation,
    example: known.example,
    hint: word?.hint || known.hint,
    note: null,
    pos: sense?.pos ?? null,
    level: known.level,
    band: bandOf(known.rank),
    review: word?.correct ?? 0,
    examples,
  }
}
