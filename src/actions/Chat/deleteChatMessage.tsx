'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'

export default async function deleteChatMessage(messageId: string) {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  const row = await database
    .selectFrom('chatMessages')
    .select(['id', 'userId', 'role'])
    .where('id', '=', messageId)
    .executeTakeFirst()
  if (!row || row.userId !== id || row.role !== 'user') {
    throw new Error('Можно удалить только свой запрос')
  }
  await database.deleteFrom('chatMessages').where('id', '=', messageId).where('userId', '=', id).execute()
}
