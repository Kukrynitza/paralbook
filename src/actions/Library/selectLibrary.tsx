'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'
import { pageOf, ratingOf } from '@/sorse/query'
import type { LibraryItem, PageResult } from '@/sorse/types'
import { sql } from 'kysely'

export default async function selectLibrary(query: string, sort: string, page: number): Promise<PageResult<LibraryItem>> {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  const needle = query.trim().replace(/[%_\\]/g, '')
  let rowsQuery = database
    .selectFrom('texts')
    .select(['id', 'title', 'excerpt', 'minutes', 'level', 'topic', 'baseRating', 'createdAt'])
    .where('published', '=', true)
  if (needle) {
    const pattern = `%${needle}%`
    rowsQuery = rowsQuery.where(
      sql<boolean>`(title ilike ${pattern} or topic ilike ${pattern} or excerpt ilike ${pattern} or level::text ilike ${pattern})`,
    )
  }
  const rows = await rowsQuery.execute()
  const votes = await database.selectFrom('votes').select(['userId', 'textId', 'value']).execute()
  const saved = await database.selectFrom('collectionItems').select('textId').where('userId', '=', id).execute()
  const savedIds = new Set(saved.map((item) => item.textId))
  const items = rows.map((row) => {
    const likes = votes.filter((item) => item.textId === row.id && item.value === 'like').length
    const dislikes = votes.filter((item) => item.textId === row.id && item.value === 'dislike').length
    const mine = votes.find((item) => item.textId === row.id && item.userId === id)
    return {
      id: row.id,
      title: row.title,
      excerpt: row.excerpt,
      minutes: row.minutes,
      level: row.level,
      topic: row.topic,
      rating: ratingOf(row.baseRating, likes, dislikes),
      vote: mine?.value ?? null,
      saved: savedIds.has(row.id),
      createdAt: new Date(row.createdAt).toISOString(),
    }
  })
  items.sort((a, b) => {
    if (sort === 'rating') return b.rating - a.rating || b.createdAt.localeCompare(a.createdAt)
    if (sort === 'length') return b.minutes - a.minutes || b.createdAt.localeCompare(a.createdAt)
    return b.createdAt.localeCompare(a.createdAt)
  })
  return pageOf(items, page)
}
