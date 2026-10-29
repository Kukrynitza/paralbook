'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'

export default async function pinCollection(entryId: string) {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  const entry = await database
    .selectFrom('collectionItems')
    .select(['id', 'pinned'])
    .where('id', '=', entryId)
    .where('userId', '=', id)
    .executeTakeFirst()
  if (!entry) {
    throw new Error('В подборке нет такого текста')
  }
  await database.updateTable('collectionItems').set({ pinned: !entry.pinned }).where('id', '=', entry.id).execute()
}
