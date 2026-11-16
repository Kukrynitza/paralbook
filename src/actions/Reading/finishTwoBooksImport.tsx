'use server'

import database from '@/modules/database'
import { MAX_TWO_BOOKS_TOKENS } from '@/sorse/uploadLimits'
import userId from '@/sorse/userId'

export default async function finishTwoBooksImport(textId: string, words: number) {
  const id = await userId()
  if (!id) throw new Error('Нужно войти')
  if (typeof textId !== 'string' || !textId) throw new Error('Текст не найден')
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
  if (!Number(countRow.total)) throw new Error('В книге нет страниц')
  const safeWords = Math.min(MAX_TWO_BOOKS_TOKENS, Math.max(0, Math.round(Number(words) || 0)))
  const minutes = Math.max(1, Math.round(safeWords / 120))
  await database.transaction().execute(async (trx) => {
    await trx.updateTable('texts').set({ minutes }).where('id', '=', textId).execute()
    await trx
      .insertInto('collectionItems')
      .values({ userId: id, textId, source: 'upload', progress: 0, credited: false })
      .onConflict((conflict) => conflict.columns(['userId', 'textId']).doNothing())
      .execute()
  })
}
