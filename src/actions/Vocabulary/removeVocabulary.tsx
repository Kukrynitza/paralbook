'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'

export default async function removeVocabulary(itemId: string) {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  const removed = await database
    .deleteFrom('userWords')
    .where('id', '=', itemId)
    .where('userId', '=', id)
    .returning('id')
    .executeTakeFirst()
  if (!removed) {
    throw new Error('Слова нет в словаре')
  }
}
