'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'
import { addActivity } from '@/sorse/query'

export default async function saveProgress(textId: string, page: number): Promise<{ page: number; progress: number; finished: boolean }> {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  return database.transaction().execute(async (trx) => {
    const text = await trx.selectFrom('texts').select(['id', 'minutes']).where('id', '=', textId).executeTakeFirst()
    const entry = await trx
      .selectFrom('collectionItems')
      .select(['id', 'credited'])
      .where('userId', '=', id)
      .where('textId', '=', textId)
      .executeTakeFirst()
    if (!text || !entry) {
      throw new Error('Сначала добавьте текст в подборку')
    }
    const pageCount = await trx
      .selectFrom('pages')
      .select((expression) => expression.fn.countAll<string>().as('total'))
      .where('textId', '=', textId)
      .executeTakeFirstOrThrow()
    const total = Number(pageCount.total)
    if (!total) {
      throw new Error('Текст не найден')
    }
    const last = total - 1
    const next = Math.max(0, Math.min(last, page))
    let progress = next / total
    let finished = false
    if (page >= total) {
      progress = 1
      finished = true
      if (!entry.credited) {
        await addActivity(trx, id, text.minutes, 0)
        await trx.updateTable('collectionItems').set({ credited: true }).where('id', '=', entry.id).execute()
      }
    }
    await trx.updateTable('collectionItems').set({ progress }).where('id', '=', entry.id).execute()
    return { page: Math.min(next, last), progress, finished }
  })
}
