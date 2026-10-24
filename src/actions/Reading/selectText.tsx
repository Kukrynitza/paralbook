'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'
import type { ReadPayload, ReadToken, RuToken } from '@/sorse/types'

export default async function selectText(textId: string): Promise<ReadPayload> {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  const text = await database
    .selectFrom('texts')
    .select(['id', 'ownerId', 'title', 'minutes', 'level', 'published'])
    .where('id', '=', textId)
    .executeTakeFirst()
  if (!text || (!text.published && text.ownerId !== id)) {
    throw new Error('Текст не найден')
  }
  const entry = await database
    .selectFrom('collectionItems')
    .select('progress')
    .where('userId', '=', id)
    .where('textId', '=', textId)
    .executeTakeFirst()
  const pages = await database
    .selectFrom('pages')
    .select(['id', 'position'])
    .where('textId', '=', textId)
    .orderBy('position', 'asc')
    .execute()
  if (!pages.length) {
    throw new Error('Текст не найден')
  }
  const pageIds = pages.map((item) => item.id)
  const ru = await database
    .selectFrom('ruTokens')
    .select(['pageId', 'position', 'text'])
    .where('pageId', 'in', pageIds)
    .orderBy('position', 'asc')
    .execute()
  const en = await database
    .selectFrom('enTokens')
    .select(['pageId', 'position', 'text', 'lemma', 'align'])
    .where('pageId', 'in', pageIds)
    .orderBy('position', 'asc')
    .execute()
  const lemmas = [...new Set(en.flatMap((item) => (item.lemma ? [item.lemma] : [])))]
  const glosses = lemmas.length
    ? await database.selectFrom('lemmas').select(['lemma', 'gloss']).where('lemma', 'in', lemmas).execute()
    : []
  const glossByLemma = new Map(glosses.map((item) => [item.lemma, item.gloss]))
  const pageCount = pages.length
  const progress = Number(entry?.progress ?? 0)
  const page = Math.min(pageCount - 1, Math.max(0, Math.round(progress * pageCount)))
  return {
    id: text.id,
    title: text.title,
    minutes: text.minutes,
    level: text.level,
    page,
    pageCount,
    progress,
    pages: pages.map((item) => ({
      ruTokens: ru
        .filter((token) => token.pageId === item.id)
        .map((token): RuToken => ({ text: token.text })),
      tokens: en
        .filter((token) => token.pageId === item.id)
        .map((token): ReadToken => ({
          text: token.text,
          lemma: token.lemma ?? undefined,
          gloss: token.lemma ? glossByLemma.get(token.lemma) : undefined,
          align: token.align ?? undefined,
        })),
    })),
  }
}
