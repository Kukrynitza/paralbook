'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'
import { pageWindow } from '@/sorse/query'
import type { CollectionItem, PageResult } from '@/sorse/types'
import { sql } from 'kysely'

const PAGE = 10

export default async function selectCollection(sort: string, page: number): Promise<PageResult<CollectionItem>> {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  const counted = await database
    .selectFrom('collectionItems')
    .select(sql<number>`count(*)::int`.as('total'))
    .where('userId', '=', id)
    .executeTakeFirst()
  const window = pageWindow(Number(counted?.total ?? 0), page, PAGE)
  let rowsQuery = database
    .selectFrom('collectionItems')
    .innerJoin('texts', 'texts.id', 'collectionItems.textId')
    .select([
      'collectionItems.id',
      'collectionItems.textId',
      'collectionItems.source',
      'collectionItems.progress',
      'collectionItems.pinned',
      'collectionItems.addedAt',
      'texts.title',
      'texts.excerpt',
      'texts.minutes',
      'texts.level',
      'texts.topic',
      'texts.published',
      sql<number | null>`(select avg(score)::float8 from votes where text_id = collection_items.text_id)`.as('rating'),
      sql<number | null>`(select score from votes where text_id = collection_items.text_id and user_id = ${id})`.as('mine'),
    ])
    .where('collectionItems.userId', '=', id)
    .orderBy('collectionItems.pinned', 'desc')
  if (sort === 'progress') rowsQuery = rowsQuery.orderBy('collectionItems.progress', 'desc')
  else if (sort === 'length') rowsQuery = rowsQuery.orderBy('texts.minutes', 'desc')
  const rows = await rowsQuery.orderBy('collectionItems.addedAt', 'desc').limit(PAGE).offset(window.offset).execute()
  return {
    page: window.page,
    pages: window.pages,
    total: window.total,
    items: rows.map((row) => ({
      id: row.id,
      textId: row.textId,
      source: row.source,
      published: row.published,
      title: row.title,
      excerpt: row.excerpt,
      minutes: row.minutes,
      level: row.level,
      topic: row.topic,
      rating: row.rating == null ? null : Math.round(Number(row.rating) * 10) / 10,
      score: row.mine == null ? null : Number(row.mine),
      progress: Number(row.progress),
      pinned: row.pinned,
      createdAt: new Date(row.addedAt).toISOString(),
    })),
  }
}
