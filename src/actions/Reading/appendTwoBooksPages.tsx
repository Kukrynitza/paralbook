'use server'

import database from '@/modules/database'
import { appendParallelPages, type ParallelPage } from '@/sorse/textBook'
import {
  MAX_TWO_BOOKS_BATCH_TOKENS,
  MAX_TWO_BOOKS_PAGES,
  MAX_TWO_BOOKS_TOKENS,
} from '@/sorse/uploadLimits'
import userId from '@/sorse/userId'

function validate(pages: ParallelPage[]) {
  let tokens = 0
  for (const page of pages) {
    if (!page || !Array.isArray(page.en) || !Array.isArray(page.ru)) {
      throw new Error('Некорректные данные страницы')
    }
    const enCount = page.en.length
    for (const token of page.en) {
      if (!token || typeof token.text !== 'string' || !token.text) {
        throw new Error('Пустой английский токен')
      }
      if (!token.text.trim()) continue
      if (
        token.align !== null &&
        (!Number.isInteger(token.align) || token.align < 0 || token.align >= enCount)
      ) {
        throw new Error('Некорректное выравнивание')
      }
    }
    for (const token of page.ru) {
      if (!token || typeof token.text !== 'string' || !token.text.trim()) {
        throw new Error('Пустой русский токен')
      }
    }
    tokens += page.en.length + page.ru.length
  }
  return tokens
}

export default async function appendTwoBooksPages(textId: string, offset: number, pages: ParallelPage[]) {
  const id = await userId()
  if (!id) throw new Error('Нужно войти')
  if (typeof textId !== 'string' || !textId) throw new Error('Текст не найден')
  if (!Number.isInteger(offset) || offset < 0) throw new Error('Некорректный номер страницы')
  if (!Array.isArray(pages) || !pages.length || pages.length > 20) {
    throw new Error('Некорректный пакет страниц')
  }
  const tokens = validate(pages)
  if (tokens > MAX_TWO_BOOKS_BATCH_TOKENS) throw new Error('Пакет страниц слишком большой')
  const text = await database
    .selectFrom('texts')
    .select(['id', 'ownerId'])
    .where('id', '=', textId)
    .executeTakeFirst()
  if (!text || text.ownerId !== id) throw new Error('Текст не найден')
  const countRow = await database
    .selectFrom('pages')
    .select((expression) => expression.fn.countAll<string>().as('total'))
    .where('textId', '=', textId)
    .executeTakeFirstOrThrow()
  const current = Number(countRow.total)
  if (current !== offset) throw new Error('Нарушен порядок страниц импорта')
  if (offset + pages.length > MAX_TWO_BOOKS_PAGES) throw new Error('В книге слишком много страниц')
  const [enCountRow, ruCountRow] = await Promise.all([
    database
      .selectFrom('enTokens')
      .innerJoin('pages', 'pages.id', 'enTokens.pageId')
      .select((expression) => expression.fn.countAll<string>().as('total'))
      .where('pages.textId', '=', textId)
      .executeTakeFirstOrThrow(),
    database
      .selectFrom('ruTokens')
      .innerJoin('pages', 'pages.id', 'ruTokens.pageId')
      .select((expression) => expression.fn.countAll<string>().as('total'))
      .where('pages.textId', '=', textId)
      .executeTakeFirstOrThrow(),
  ])
  if (Number(enCountRow.total) + Number(ruCountRow.total) + tokens > MAX_TWO_BOOKS_TOKENS) {
    throw new Error('В книге слишком много токенов')
  }
  await database.transaction().execute(async (trx) => {
    await appendParallelPages(trx, textId, offset, pages)
  })
}
