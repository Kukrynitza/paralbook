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
    const text = await trx
      .selectFrom('texts')
      .select(['id', 'minutes', 'ownerId', 'published'])
      .where('id', '=', textId)
      .executeTakeFirst()
    if (!text || (!text.published && text.ownerId !== id)) {
      throw new Error('Текст не найден')
    }
    let entry = await trx
      .selectFrom('collectionItems')
      .select(['id', 'credited', 'progress'])
      .where('userId', '=', id)
      .where('textId', '=', textId)
      .executeTakeFirst()
    if (!entry) {
      const source = text.published && text.ownerId !== id ? 'library' : 'upload'
      entry = await trx
        .insertInto('collectionItems')
        .values({ userId: id, textId, source, progress: 0, credited: false })
        .returning(['id', 'credited', 'progress'])
        .executeTakeFirstOrThrow()
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
    const previous = Number(entry.progress) || 0
    let progress = Math.max(previous, next / total)
    let finished = false
    if (page >= total) {
      progress = 1
      finished = true
    }
    const gained = Math.floor(progress * text.minutes) - Math.floor(previous * text.minutes)
    if (gained > 0) await addActivity(trx, id, gained, 0)
    if (finished && !entry.credited) {
      await trx.updateTable('collectionItems').set({ credited: true }).where('id', '=', entry.id).execute()
    }
    await trx.updateTable('collectionItems').set({ progress }).where('id', '=', entry.id).execute()
    return { page: Math.min(next, last), progress, finished }
  })
}
