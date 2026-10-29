'use server'

import { sql, type RawBuilder, type SqlBool } from 'kysely'
import database from '@/modules/database'
import { touchStreak } from '@/sorse/query'
import { LEVELS } from '@/sorse/types'
import userId from '@/sorse/userId'

const BANDS: Record<string, [number, number]> = {
  r100: [1, 100],
  r1000: [101, 1000],
  r3000: [1001, 3000],
}

export interface StudyDeck {
  lemmas: string[]
  mode: string
  nextMinutes: number | null
  nextDueAt: string | null
  newToday: number
  streak: number
  today: { new: number; reviewed: number; known: number; mastered: number }
}

function chosenPacks(packs: string[]) {
  const allowed = new Set<string>(['own', 'texts', ...LEVELS, ...Object.keys(BANDS)])
  const chosen: string[] = []
  for (const pack of packs) {
    const name = pack === 'frequent' ? 'r100' : pack
    if (allowed.has(name) && !chosen.includes(name)) chosen.push(name)
  }
  return chosen
}

function textScope(alias: 'uw' | 'l') {
  return sql<SqlBool>`(
    nullif(btrim(coalesce(${sql.raw(alias)}.context_en, '')), '') is not null
    or exists (
      select 1
      from en_tokens e
      join pages p on p.id = e.page_id
      join collection_items c on c.text_id = p.text_id and c.user_id = ${sql.raw(alias)}.user_id
      where c.source in ('upload', 'chat') and e.lemma = ${sql.raw(alias)}.lemma
    )
  )`
}

function dueScope(chosen: string[]) {
  if (!chosen.length || chosen.includes('own')) return sql``
  const parts: RawBuilder<unknown>[] = []
  if (chosen.includes('texts')) parts.push(textScope('uw'))
  for (const level of LEVELS) {
    if (chosen.includes(level)) parts.push(sql`l.level = ${level}`)
  }
  for (const [pack, [low, high]] of Object.entries(BANDS)) {
    if (chosen.includes(pack)) parts.push(sql`l.rank between ${low} and ${high}`)
  }
  if (!parts.length) return sql``
  return sql` and (${sql.join(parts, sql` or `)})`
}

async function freshLemmas(ownerId: string, chosen: string[], limit: number) {
  const parts: RawBuilder<unknown>[] = []
  if (chosen.includes('texts')) {
    parts.push(sql`
      select uw.lemma
      from user_words uw
      where uw.user_id = ${ownerId}
        and uw.mastered = false
        and ${textScope('uw')}
    `)
  }
  const fresh: RawBuilder<unknown>[] = []
  if (chosen.includes('own')) fresh.push(sql`select lemma from user_words where user_id = ${ownerId} and mastered = false`)
  for (const level of LEVELS) {
    if (chosen.includes(level)) fresh.push(sql`select lemma from lemmas where level = ${level}`)
  }
  for (const [pack, [low, high]] of Object.entries(BANDS)) {
    if (chosen.includes(pack)) fresh.push(sql`select lemma from lemmas where rank between ${low} and ${high}`)
  }
  if (fresh.length) {
    parts.push(sql`
      select pool.lemma
      from (${sql.join(fresh, sql` union `)}) pool
      where not exists (
        select 1 from user_words uw where uw.user_id = ${ownerId} and uw.lemma = pool.lemma
      )
    `)
  }
  if (!parts.length) return []
  const rows = await sql<{ lemma: string }>`
    select pool.lemma
    from (${sql.join(parts, sql` union `)}) pool
    order by random()
    limit ${limit}
  `.execute(database)
  return rows.rows.map((row) => row.lemma).filter(Boolean)
}

export default async function studyDeck(packs: string[], mode: string, daily: number, extra = false): Promise<StudyDeck> {
  const id = await userId()
  if (!id) throw new Error('Нужно войти')
  const limit = Math.min(60, Math.max(5, Math.round(daily || 10)))
  const kind = mode === 'learn' || mode === 'review' || mode === 'mixed' ? mode : ''
  const chosen = chosenPacks(packs)
  const streak = await touchStreak(database, id)
  const scope = dueScope(chosen)
  const activity = await sql<{ words: number }>`
    select words from activity_days where user_id = ${id} and day = current_date
  `.execute(database)
  const upcoming = await sql<{ dueAt: Date | string | null }>`
    select uw.due_at as "dueAt"
    from user_words uw
    join lemmas l on l.lemma = uw.lemma
    where uw.user_id = ${id} and uw.mastered = false and uw.due_at > now()
    ${scope}
    order by uw.due_at asc
    limit 1
  `.execute(database)
  const reviewed = await sql<{ n: number }>`
    select count(*)::int as n
    from (
      select due_at - case interval_days
        when 1 then interval '30 minutes'
        when 2 then interval '12 hours'
        when 3 then interval '1 day'
        when 4 then interval '7 days'
        when 5 then interval '30 days'
        else interval '60 days'
      end as reviewed_at
      from user_words
      where user_id = ${id} and mastered = false and interval_days between 1 and 6
        and not (correct = 1 and wrong = 0 and interval_days = 1)
    ) steps
    where reviewed_at >= date_trunc('day', now())
      and reviewed_at < date_trunc('day', now()) + interval '1 day'
  `.execute(database)
  const known = await sql<{ n: number }>`
    select count(*)::int as n from user_words
    where user_id = ${id}
      and correct = 1 and wrong = 0 and interval_days = 1 and mastered = false
      and (due_at - interval '30 minutes') >= date_trunc('day', now())
      and (due_at - interval '30 minutes') < date_trunc('day', now()) + interval '1 day'
  `.execute(database)
  const mastered = await sql<{ n: number }>`
    select count(*)::int as n from user_words
    where user_id = ${id} and mastered = true
      and due_at >= date_trunc('day', now())
      and due_at < date_trunc('day', now()) + interval '1 day'
  `.execute(database)
  const due = await sql<{ lemma: string }>`
    select uw.lemma
    from user_words uw
    join lemmas l on l.lemma = uw.lemma
    where uw.user_id = ${id} and uw.mastered = false and (uw.due_at is null or uw.due_at <= now())
    ${scope}
    order by uw.due_at asc nulls first, random()
    limit 500
  `.execute(database)
  const dueAt = upcoming.rows[0]?.dueAt
  const dueDate = dueAt ? new Date(dueAt) : null
  const seconds = dueDate ? (dueDate.getTime() - Date.now()) / 1000 : 0
  const nextMinutes = seconds > 0 ? Math.max(1, Math.ceil(seconds / 60)) : null
  const nextDueAt = seconds > 0 && dueDate ? dueDate.toISOString() : null
  const dueLemmas = due.rows.map((row) => row.lemma).filter(Boolean)
  const blocked = Boolean(kind) && !extra && dueLemmas.length === 0 && nextMinutes !== null
  let fresh: string[] = []
  if (extra || ((kind === 'learn' || kind === 'mixed') && chosen.length > 0 && !blocked)) {
    if (!chosen.length) throw new Error('Выберите хотя бы одну пачку')
    fresh = await freshLemmas(id, chosen, limit)
    if ((extra || kind === 'learn') && fresh.length === 0) throw new Error('В выбранных пачках нет новых слов')
  }
  let lemmas: string[] = []
  if (extra) lemmas = fresh
  else if (blocked) lemmas = []
  else if (kind === 'review') lemmas = dueLemmas
  else if (kind === 'learn') lemmas = fresh
  else if (kind === 'mixed') {
    const seen = new Set<string>()
    lemmas = [...dueLemmas, ...fresh].filter((lemma) => {
      if (seen.has(lemma)) return false
      seen.add(lemma)
      return true
    })
  }
  const learned = Number(known.rows[0]?.n ?? 0)
  const added = Math.max(0, Number(activity.rows[0]?.words ?? 0) - learned)
  return {
    lemmas,
    mode: extra ? 'learn' : kind,
    nextMinutes,
    nextDueAt,
    newToday: added,
    streak,
    today: {
      new: added,
      reviewed: Number(reviewed.rows[0]?.n ?? 0),
      known: learned,
      mastered: Number(mastered.rows[0]?.n ?? 0),
    },
  }
}
