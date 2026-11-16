'use server'

import { sql } from 'kysely'
import database from '@/modules/database'
import { splitByShare } from '@/sorse/align'
import userId from '@/sorse/userId'
import type { ReadPayload, ReadToken, RuToken } from '@/sorse/types'

type KnownWord = { formNorm: string; lemma: string; rank: number; translation: string | null }

function bare(part: string) {
  return part.replace(/^[^A-Za-zА-Яа-яЁё]+|[^A-Za-zА-Яа-яЁё]+$/g, '').toLowerCase()
}

async function legacyRussian(textId: string, pageIndex: number): Promise<RuToken[] | null> {
  const pages = await database
    .selectFrom('pages')
    .select(['id', 'position'])
    .where('textId', '=', textId)
    .orderBy('position', 'asc')
    .execute()
  if (pages.length < 2) return null
  const [enCounts, ruCounts] = await Promise.all([
    database
      .selectFrom('enTokens')
      .innerJoin('pages', 'pages.id', 'enTokens.pageId')
      .select('pages.position')
      .select((expression) => expression.fn.countAll<string>().as('total'))
      .where('pages.textId', '=', textId)
      .where(sql<boolean>`btrim(en_tokens.text) <> ''`)
      .groupBy('pages.position')
      .execute(),
    database
      .selectFrom('ruTokens')
      .innerJoin('pages', 'pages.id', 'ruTokens.pageId')
      .select('pages.position')
      .select((expression) => expression.fn.countAll<string>().as('total'))
      .where('pages.textId', '=', textId)
      .where(sql<boolean>`btrim(ru_tokens.text) <> ''`)
      .groupBy('pages.position')
      .execute(),
  ])
  const enMap = new Map(enCounts.map((row) => [row.position, Number(row.total)]))
  const ruMap = new Map(ruCounts.map((row) => [row.position, Number(row.total)]))
  const weights = pages.map((page) => enMap.get(page.position) ?? 0)
  const own = pages.map((page) => ruMap.get(page.position) ?? 0)
  const dump = own.findIndex((words, index) => {
    const rest = own.reduce((sum, item, itemIndex) => (itemIndex === index ? sum : sum + item), 0)
    return words > weights[index] * 2 && rest <= 8
  })
  if (dump < 0) return null
  const dumpPage = pages[dump]
  const rows = await database
    .selectFrom('ruTokens')
    .select('text')
    .where('pageId', '=', dumpPage.id)
    .orderBy('position', 'asc')
    .execute()
  const words = rows.map((row) => row.text).filter((text) => text.trim())
  const slices = splitByShare(words, weights)
  return (slices[pageIndex] ?? []).map((text): RuToken => ({ text }))
}

export default async function selectText(textId: string, requestedPage?: number): Promise<ReadPayload> {
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
  const pageCountRow = await database
    .selectFrom('pages')
    .select((expression) => expression.fn.countAll<string>().as('total'))
    .where('textId', '=', textId)
    .executeTakeFirstOrThrow()
  const pageCount = Number(pageCountRow.total)
  if (!pageCount) {
    throw new Error('Текст не найден')
  }
  const progress = Number(entry?.progress ?? 0)
  const fallbackPage = Math.min(pageCount - 1, Math.max(0, Math.round(progress * pageCount)))
  const pageIndex = Math.min(
    pageCount - 1,
    Math.max(0, requestedPage !== undefined && Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : fallbackPage),
  )
  const page = await database
    .selectFrom('pages')
    .select(['id', 'position'])
    .where('textId', '=', textId)
    .where('position', '=', pageIndex)
    .executeTakeFirst()
  if (!page) {
    throw new Error('Страница не найдена')
  }
  const [ruRows, enRows] = await Promise.all([
    database
      .selectFrom('ruTokens')
      .select('text')
      .where('pageId', '=', page.id)
      .orderBy('position', 'asc')
      .execute(),
    database
      .selectFrom('enTokens')
      .select(['text', 'align'])
      .where('pageId', '=', page.id)
      .orderBy('position', 'asc')
      .execute(),
  ])
  let ruTokens: RuToken[] = ruRows.map((token) => ({ text: token.text }))
  const ruWords = ruRows.filter((token) => token.text.trim()).length
  const enWords = enRows.filter((token) => token.text.trim()).length
  if (pageCount > 1 && (ruWords === 0 || ruWords > enWords * 2)) {
    const legacy = await legacyRussian(textId, pageIndex)
    if (legacy !== null) ruTokens = legacy
  }
  const forms = [...new Set(enRows.map((token) => bare(token.text)).filter(Boolean))]
  const known: KnownWord[] = []
  for (let index = 0; index < forms.length; index += 500) {
    const rows = await database
      .selectFrom('wordForms')
      .innerJoin('lemmas', 'lemmas.lemma', 'wordForms.lemma')
      .select(['wordForms.formNorm', 'wordForms.lemma', 'lemmas.rank', 'lemmas.translation'])
      .where('wordForms.formNorm', 'in', forms.slice(index, index + 500))
      .execute()
    known.push(...rows)
  }
  const byForm = new Map<string, KnownWord[]>()
  for (const row of known) {
    const list = byForm.get(row.formNorm)
    if (list) list.push(row)
    else byForm.set(row.formNorm, [row])
  }
  function resolve(form: string) {
    const rows = byForm.get(form)
    if (!rows) return undefined
    const exact = rows.find((row) => row.lemma === form)
    return (
      exact ??
      rows.reduce<KnownWord | undefined>((best, row) => {
        if (!best || row.rank < best.rank) return row
        return best
      }, undefined)
    )
  }
  function displayTokens(rows: { text: string; align: number | null }[]) {
    const result: ReadToken[] = []
    for (const row of rows) {
      for (const part of row.text.split(/(\s+)/)) {
        if (!part) continue
        if (!part.trim()) {
          result.push({ text: part })
          continue
        }
        const form = bare(part)
        const match = form ? resolve(form) : undefined
        result.push({
          text: part,
          lemma: match?.lemma,
          translation: match?.translation ?? undefined,
          align: row.align ?? undefined,
        })
      }
    }
    return result
  }
  return {
    id: text.id,
    title: text.title,
    minutes: text.minutes,
    level: text.level,
    page: pageIndex,
    pageCount,
    progress,
    ruTokens,
    tokens: displayTokens(enRows),
  }
}
