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
  const forms = [...new Set(en.map((token) => token.text.replace(/^[^A-Za-zА-Яа-яЁё]+|[^A-Za-zА-Яа-яЁё]+$/g, '').toLowerCase()).filter(Boolean))]
  const known = forms.length
    ? await database
        .selectFrom('wordForms')
        .innerJoin('lemmas', 'lemmas.lemma', 'wordForms.lemma')
        .select(['wordForms.formNorm', 'wordForms.lemma', 'lemmas.rank', 'lemmas.translation'])
        .where('wordForms.formNorm', 'in', forms)
        .execute()
    : []
  function resolve(form: string) {
    const rows = known.filter((item) => item.formNorm === form)
    const exact = rows.find((item) => item.lemma === form)
    return exact ?? rows.reduce<(typeof rows)[number] | undefined>((best, item) => {
      if (!best || item.rank < best.rank) return item
      return best
    }, undefined)
  }
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
        .map((token): ReadToken => {
          const form = token.text.replace(/^[^A-Za-zА-Яа-яЁё]+|[^A-Za-zА-Яа-яЁё]+$/g, '').toLowerCase()
          const known = form ? resolve(form) : undefined
          return {
            text: token.text,
            lemma: known?.lemma,
            translation: known?.translation ?? undefined,
            align: token.align ?? undefined,
          }
        }),
    })),
  }
}
