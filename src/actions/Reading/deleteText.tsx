'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'

export default async function deleteText(textId: string) {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  const text = await database.selectFrom('texts').select(['id', 'ownerId']).where('id', '=', textId).executeTakeFirst()
  if (!text) {
    throw new Error('Текст не найден')
  }
  if (text.ownerId !== id) {
    throw new Error('Чужой текст удалить нельзя')
  }
  await database.transaction().execute(async (trx) => {
    const pages = await trx.selectFrom('pages').select('id').where('textId', '=', textId).execute()
    const pageIds = pages.map((item) => item.id)
    if (pageIds.length) {
      await trx.deleteFrom('enTokens').where('pageId', 'in', pageIds).execute()
      await trx.deleteFrom('ruTokens').where('pageId', 'in', pageIds).execute()
      await trx.deleteFrom('pages').where('textId', '=', textId).execute()
    }
    await trx.deleteFrom('votes').where('textId', '=', textId).execute()
    await trx.deleteFrom('collectionItems').where('textId', '=', textId).execute()
    await trx.deleteFrom('chatMessages').where('textId', '=', textId).execute()
    await trx.deleteFrom('texts').where('id', '=', textId).execute()
  })
}
