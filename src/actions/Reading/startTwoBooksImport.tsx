'use server'

import database from '@/modules/database'
import { preview } from '@/sorse/preview'
import { LEVELS, type Cefr } from '@/sorse/types'
import { MAX_TWO_BOOKS_PAGES } from '@/sorse/uploadLimits'
import userId from '@/sorse/userId'

interface StartInput {
  title: string
  topic: string
  level: Cefr
  pages: number
  excerpt: string
}

export default async function startTwoBooksImport(input: StartInput) {
  const id = await userId()
  if (!id) throw new Error('Нужно войти')
  const pages = Math.round(Number(input.pages))
  if (!Number.isFinite(pages) || pages < 1 || pages > MAX_TWO_BOOKS_PAGES) {
    throw new Error('Некорректное количество страниц')
  }
  const title = String(input.title ?? '').trim().slice(0, 80) || 'Своя книга'
  const topic = String(input.topic ?? '').trim().slice(0, 120) || title
  const level = LEVELS.includes(input.level) ? input.level : 'B1'
  const excerpt = preview(String(input.excerpt ?? '') || title).slice(0, 500) || title
  const text = await database
    .insertInto('texts')
    .values({
      ownerId: id,
      title,
      excerpt,
      minutes: 1,
      level,
      topic,
      baseRating: 0,
      published: false,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return text.id
}
