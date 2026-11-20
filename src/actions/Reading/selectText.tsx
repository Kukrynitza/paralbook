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

export default async function selectText(textId: string, requestedPage?: number, batchSize = 4): Promise<ReadPayload> {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  const [text, entry, pageCountRow, ruTotal] = await Promise.all([
    database
      .selectFrom('texts')
      .select(['id', 'ownerId', 'title', 'minutes', 'level', 'published', 'ready'])
      .where('id', '=', textId)
      .executeTakeFirst(),
    database
      .selectFrom('collectionItems')
      .select('progress')
      .where('userId', '=', id)
      .where('textId', '=', textId)
      .executeTakeFirst(),
    database
      .selectFrom('pages')
      .select((expression) => expression.fn.countAll<string>().as('total'))
      .where('textId', '=', textId)
      .executeTakeFirstOrThrow(),
    database
      .selectFrom('ruTokens')
      .innerJoin('pages', 'pages.id', 'ruTokens.pageId')
      .select((expression) => expression.fn.countAll<string>().as('total'))
      .where('pages.textId', '=', textId)
      .where(sql<boolean>`btrim(ru_tokens.text) <> ''`)
      .executeTakeFirstOrThrow(),
  ])
  if (!text || (!text.published && text.ownerId !== id)) {
    throw new Error('Текст не найден')
  }
  if (!text.ready) {
    throw new Error('Текст ещё обрабатывается')
  }
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
  const size = Math.min(pageCount, Math.max(1, Math.min(4, batchSize)))
  let start = Math.max(0, pageIndex - 1)
  if (start + size > pageCount) start = Math.max(0, pageCount - size)
  const indices = Array.from({ length: Math.min(size, pageCount - start) }, (_, offset) => start + offset)
  const pageRows = await database
    .selectFrom('pages')
    .select(['id', 'position'])
    .where('textId', '=', textId)
    .where('position', 'in', indices)
    .execute()
  const pageById = new Map(pageRows.map((row) => [row.position, row.id]))
  const pageIds = [...pageById.values()]
  const hasTranslation = Number(ruTotal.total) > 2
  const [ruRows, enRows] = pageIds.length
    ? await Promise.all([
        database
          .selectFrom('ruTokens')
          .select(['pageId', 'text'])
          .where('pageId', 'in', pageIds)
          .orderBy('pageId', 'asc')
          .orderBy('position', 'asc')
          .execute(),
        database
          .selectFrom('enTokens')
          .select(['pageId', 'text', 'lemma', 'pos', 'align', 'ruAlign'])
          .where('pageId', 'in', pageIds)
          .orderBy('pageId', 'asc')
          .orderBy('position', 'asc')
          .execute(),
      ])
    : [[], []]
  const ruByPage = new Map<string, { text: string }[]>()
  for (const row of ruRows) {
    const list = ruByPage.get(row.pageId)
    if (list) list.push({ text: row.text })
    else ruByPage.set(row.pageId, [{ text: row.text }])
  }
  const enByPage = new Map<string, { text: string; lemma: string | null; pos: string | null; align: number | null; ruAlign: number | null }[]>()
  for (const row of enRows) {
    const list = enByPage.get(row.pageId)
    if (list) list.push(row)
    else enByPage.set(row.pageId, [row])
  }
  const forms = [...new Set(enRows.map((token) => bare(token.text)).filter(Boolean))]
  const lemmas = new Set<string>()
  for (const token of enRows) {
    if (token.lemma) lemmas.add(token.lemma)
    if (token.pos === 'NOUN' || token.pos === 'ADJ' || token.pos === 'PRON') {
      const surface = bare(token.text)
      if (surface) lemmas.add(surface)
    }
  }
  const glossRows = lemmas.size
    ? await database
        .selectFrom('lemmaGlosses')
        .select(['lemma', 'pos', 'gloss'])
        .where('lemma', 'in', [...lemmas])
        .execute()
    : []
  const glosses = new Map(glossRows.map((row) => [`${row.lemma}|${row.pos}`, row.gloss]))
  const covered = (form: string, lemma: string | null, pos: string | null) => {
    if (!form) return true
    if (lemma && (glosses.has(`${lemma}|${pos ?? '*'}`) || glosses.has(`${lemma}|*`))) return true
    if ((pos === 'NOUN' || pos === 'ADJ' || pos === 'PRON') && glosses.has(`${form}|${pos}`)) return true
    return false
  }
  const needsFallback = enRows.some((row) => !covered(bare(row.text), row.lemma, row.pos))
  const known: KnownWord[] = []
  if (needsFallback) {
    for (let index = 0; index < forms.length; index += 500) {
      const rows = await database
        .selectFrom('wordForms')
        .innerJoin('lemmas', 'lemmas.lemma', 'wordForms.lemma')
        .select(['wordForms.formNorm', 'wordForms.lemma', 'lemmas.rank', 'lemmas.translation'])
        .where('wordForms.formNorm', 'in', forms.slice(index, index + 500))
        .execute()
      known.push(...rows)
    }
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

  const pages: ReadPayload['pages'] = []
  for (const pageIndexValue of indices) {
    const pageId = pageById.get(pageIndexValue)
    if (!pageId) continue
    const rus = ruByPage.get(pageId) ?? []
    const eng = enByPage.get(pageId) ?? []
    let ruTokens: RuToken[] = rus.map((token) => ({ text: token.text }))
    const ruWords = rus.filter((token) => token.text.trim()).length
    const enWords = eng.filter((token) => token.text.trim()).length
    if (hasTranslation && pageCount > 1 && (ruWords === 0 || ruWords > enWords * 2)) {
      const legacy = await legacyRussian(textId, pageIndexValue)
      if (legacy !== null) ruTokens = legacy
    }
    const tokens: ReadToken[] = []
    for (const row of eng) {
      for (const part of row.text.split(/(\s+)/)) {
        if (!part) continue
        if (!part.trim()) {
          tokens.push({ text: part })
          continue
        }
        const form = bare(part)
        let pos = row.pos ?? undefined
        const surface = form && (row.pos === 'NOUN' || row.pos === 'ADJ' || row.pos === 'PRON') && glosses.has(`${form}|${row.pos}`) ? form : undefined
        const chosen = surface ?? (row.lemma && (glosses.has(`${row.lemma}|${row.pos ?? '*'}`) || glosses.has(`${row.lemma}|*`)) ? row.lemma : undefined)
        let lemma: string | undefined = chosen
        let translation: string | undefined = chosen
          ? glosses.get(`${chosen}|${row.pos ?? '*'}`) ?? glosses.get(`${chosen}|*`)
          : undefined
        if (!translation) {
          const match = form ? resolve(form) : undefined
          lemma = match?.lemma
          translation = match?.translation ?? undefined
          pos = undefined
        }
        tokens.push({
          text: part,
          lemma,
          pos,
          translation,
          align: row.align ?? undefined,
          ruAlign: row.ruAlign ?? undefined,
        })
      }
    }
    pages.push({ page: pageIndexValue, tokens, ruTokens })
  }
  if (!pages.length) {
    throw new Error('Страница не найдена')
  }
  return {
    id: text.id,
    title: text.title,
    minutes: text.minutes,
    level: text.level,
    page: pageIndex,
    pageCount,
    progress,
    hasTranslation,
    pages,
  }
}
