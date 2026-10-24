'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'

export default async function removeFromCollection(entryId: string) {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  const removed = await database
    .deleteFrom('collectionItems')
    .where('id', '=', entryId)
    .where('userId', '=', id)
    .returning('id')
    .executeTakeFirst()
  if (!removed) {
    throw new Error('В подборке нет такого текста')
  }
}
