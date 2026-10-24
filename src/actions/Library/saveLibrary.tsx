'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'

export default async function saveLibrary(textId: string) {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  const text = await database.selectFrom('texts').select('published').where('id', '=', textId).executeTakeFirst()
  if (!text?.published) {
    throw new Error('Текст не опубликован')
  }
  const existing = await database
    .selectFrom('collectionItems')
    .select('id')
    .where('userId', '=', id)
    .where('textId', '=', textId)
    .executeTakeFirst()
  if (existing) return
  await database
    .insertInto('collectionItems')
    .values({ userId: id, textId, source: 'library', progress: 0, credited: false })
    .execute()
}
