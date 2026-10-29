'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'
import { pageWindow, vocabTone } from '@/sorse/query'
import { LEVELS, type PageResult, type VocabItem } from '@/sorse/types'
import { sql, type SqlBool } from 'kysely'

const PAGE = 30

const BANDS: Record<string, [number, number]> = {
  r100: [1, 100],
  r1000: [101, 1000],
  r3000: [1001, 3000],
}

export default async function selectVocabulary(
  query: string,
  status: string,
  packs: string[] = [],
  page = 1,
): Promise<PageResult<VocabItem> & { hasWords: boolean }> {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  const needle = query.trim().replace(/[%_\\]/g, '')
  let rowsQuery = database
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
    .where('userWords.userId', '=', id)
  const chosen = [...new Set(packs)]
  if (chosen.length && !chosen.includes('own')) {
    const parts: ReturnType<typeof sql<SqlBool>>[] = []
    if (chosen.includes('texts')) {
      parts.push(sql<SqlBool>`(
        nullif(btrim(coalesce(user_words.context_en, '')), '') is not null
        or exists (
          select 1
          from en_tokens e
          join pages p on p.id = e.page_id
          join collection_items c on c.text_id = p.text_id and c.user_id = user_words.user_id
          where c.source in ('upload', 'chat') and e.lemma = user_words.lemma
        )
      )`)
    }
    for (const level of LEVELS) {
      if (chosen.includes(level)) parts.push(sql<SqlBool>`lemmas.level = ${level}`)
    }
    for (const [pack, [low, high]] of Object.entries(BANDS)) {
      if (chosen.includes(pack)) parts.push(sql<SqlBool>`lemmas.rank between ${low} and ${high}`)
    }
    if (parts.length) rowsQuery = rowsQuery.where(sql<SqlBool>`(${sql.join(parts, sql` or `)})`)
  }
  if (needle) {
    const pattern = `%${needle}%`
    rowsQuery = rowsQuery.where(sql<boolean>`(user_words.lemma ilike ${pattern} or lemmas.example ilike ${pattern})`)
  }
  if (status === 'ok') {
    rowsQuery = rowsQuery.whereRef('userWords.correct', '>', 'userWords.wrong')
  }
  if (status === 'error') {
    rowsQuery = rowsQuery.where('userWords.wrong', '>', 0).whereRef('userWords.wrong', '>=', 'userWords.correct')
  }
  const counted = await rowsQuery.clearSelect().select(sql<number>`count(*)::int`.as('total')).executeTakeFirst()
  const window = pageWindow(Number(counted?.total ?? 0), page, PAGE)
  const ordered = status === 'sum'
    ? rowsQuery.orderBy(sql`user_words.correct + user_words.wrong`, 'desc').orderBy('userWords.lemma', 'asc')
    : rowsQuery.orderBy('userWords.lemma', 'asc')
  const rows = await ordered.limit(PAGE).offset(window.offset).execute()
  const any = window.total > 0
    ? true
    : Boolean(await database.selectFrom('userWords').select('id').where('userId', '=', id).limit(1).executeTakeFirst())
  return {
    page: window.page,
    pages: window.pages,
    total: window.total,
    hasWords: any,
    items: rows.map((row) => ({
      id: row.id,
      lemma: row.lemma,
      ipa: row.ipa,
      translation: row.translation,
      example: row.contextEn || row.example,
      contextEn: row.contextEn,
      memory: null,
      hint: row.hint,
      correct: row.correct,
      wrong: row.wrong,
      mastered: row.mastered,
      tone: vocabTone(row.correct, row.wrong),
    })),
  }
}
