'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'
import { pageOf, ratingOf } from '@/sorse/query'
import type { CollectionItem, PageResult } from '@/sorse/types'

export default async function selectCollection(sort: string, page: number): Promise<PageResult<CollectionItem>> {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  const rows = await database
    .selectFrom('collectionItems')
    .innerJoin('texts', 'texts.id', 'collectionItems.textId')
    .select([
      'collectionItems.id',
      'collectionItems.textId',
      'collectionItems.source',
      'collectionItems.progress',
      'collectionItems.addedAt',
      'texts.title',
      'texts.excerpt',
      'texts.minutes',
      'texts.level',
      'texts.topic',
      'texts.baseRating',
      'texts.published',
    ])
    .where('collectionItems.userId', '=', id)
    .execute()
  const votes = await database.selectFrom('votes').select(['textId', 'value']).execute()
  const items = rows.map((row) => {
    const likes = votes.filter((item) => item.textId === row.textId && item.value === 'like').length
    const dislikes = votes.filter((item) => item.textId === row.textId && item.value === 'dislike').length
    return {
      id: row.id,
      textId: row.textId,
      source: row.source,
      published: row.published,
      title: row.title,
      excerpt: row.excerpt,
      minutes: row.minutes,
      level: row.level,
      topic: row.topic,
      rating: ratingOf(row.baseRating, likes, dislikes),
      progress: Number(row.progress),
      createdAt: new Date(row.addedAt).toISOString(),
    }
  })
  items.sort((a, b) => {
    if (sort === 'progress') return b.progress - a.progress || b.createdAt.localeCompare(a.createdAt)
    if (sort === 'length') return b.minutes - a.minutes || b.createdAt.localeCompare(a.createdAt)
    return b.createdAt.localeCompare(a.createdAt)
  })
  return pageOf(items, page)
}
