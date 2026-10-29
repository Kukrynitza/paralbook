'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'
import { pageWindow } from '@/sorse/query'
import type { LibraryItem, PageResult } from '@/sorse/types'
import { sql } from 'kysely'

const PAGE = 10

export default async function selectLibrary(query: string, sort: string, page: number): Promise<PageResult<LibraryItem>> {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  const needle = query.trim().replace(/[%_\\]/g, '')
  let countQuery = database.selectFrom('texts').select(sql<number>`count(*)::int`.as('total')).where('published', '=', true)
  let rowsQuery = database
    .selectFrom('texts')
    .select([
      'id',
      'title',
      'excerpt',
      'minutes',
      'level',
      'topic',
      'createdAt',
      sql<number | null>`(select avg(score)::float8 from votes where text_id = texts.id)`.as('rating'),
    ])
    .where('published', '=', true)
  if (needle) {
    const pattern = `%${needle}%`
    const match = sql<boolean>`(title ilike ${pattern} or topic ilike ${pattern} or excerpt ilike ${pattern} or level::text ilike ${pattern})`
    countQuery = countQuery.where(match)
    rowsQuery = rowsQuery.where(match)
  }
  const counted = await countQuery.executeTakeFirst()
  const window = pageWindow(Number(counted?.total ?? 0), page, PAGE)
  if (sort === 'rating') rowsQuery = rowsQuery.orderBy(sql`(select avg(score) from votes where text_id = texts.id) desc nulls last`)
  else if (sort === 'length') rowsQuery = rowsQuery.orderBy('minutes', 'desc')
  else rowsQuery = rowsQuery.orderBy('createdAt', 'desc')
  const rows = await rowsQuery.orderBy('createdAt', 'desc').limit(PAGE).offset(window.offset).execute()
  const ids = rows.map((row) => row.id)
  const votes = ids.length
    ? await database.selectFrom('votes').select(['textId', 'score']).where('userId', '=', id).where('textId', 'in', ids).execute()
    : []
  const saved = ids.length
    ? await database.selectFrom('collectionItems').select('textId').where('userId', '=', id).where('textId', 'in', ids).execute()
    : []
  const savedIds = new Set(saved.map((item) => item.textId))
  const mine = new Map(votes.map((item) => [item.textId, Number(item.score)]))
  return {
    page: window.page,
    pages: window.pages,
    total: window.total,
    items: rows.map((row) => ({
      id: row.id,
      title: row.title,
      excerpt: row.excerpt,
      minutes: row.minutes,
      level: row.level,
      topic: row.topic,
      rating: row.rating == null ? null : Math.round(Number(row.rating) * 10) / 10,
      score: mine.get(row.id) ?? null,
      saved: savedIds.has(row.id),
      createdAt: new Date(row.createdAt).toISOString(),
    })),
  }
}
