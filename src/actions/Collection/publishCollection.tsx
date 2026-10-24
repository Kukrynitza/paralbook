'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'

export default async function publishCollection(entryId: string) {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  const entry = await database
    .selectFrom('collectionItems')
    .innerJoin('texts', 'texts.id', 'collectionItems.textId')
    .select(['collectionItems.textId', 'texts.ownerId'])
    .where('collectionItems.id', '=', entryId)
    .where('collectionItems.userId', '=', id)
    .executeTakeFirst()
  if (!entry) {
    throw new Error('В подборке нет такого текста')
  }
  if (entry.ownerId !== id) {
    throw new Error('В библиотеку публикуется текст из чата')
  }
  await database.updateTable('texts').set({ published: true }).where('id', '=', entry.textId).execute()
  await database.updateTable('collectionItems').set({ source: 'library' }).where('id', '=', entryId).execute()
}
