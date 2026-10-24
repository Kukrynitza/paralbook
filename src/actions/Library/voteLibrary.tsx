'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'
import { libraryCard } from '@/sorse/query'
import type { LibraryItem } from '@/sorse/types'

export default async function voteLibrary(textId: string, value: 'like' | 'dislike'): Promise<LibraryItem> {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  const text = await database.selectFrom('texts').select('published').where('id', '=', textId).executeTakeFirst()
  if (!text?.published) {
    throw new Error('Текст не опубликован')
  }
  const current = await database
    .selectFrom('votes')
    .select('value')
    .where('userId', '=', id)
    .where('textId', '=', textId)
    .executeTakeFirst()
  if (current?.value === value) {
    await database.deleteFrom('votes').where('userId', '=', id).where('textId', '=', textId).execute()
  } else {
    await database
      .insertInto('votes')
      .values({ userId: id, textId, value })
      .onConflict((conflict) => conflict.columns(['userId', 'textId']).doUpdateSet({ value }))
      .execute()
  }
  return libraryCard(database, id, textId)
}
