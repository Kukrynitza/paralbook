'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'
import { sql } from 'kysely'

export default async function addFriend(code: string) {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  const friend = await database
    .selectFrom('profiles')
    .select('id')
    .where(sql`lower(friend_code)`, '=', code.trim().toLowerCase())
    .executeTakeFirst()
  if (!friend) {
    throw new Error('Код не найден')
  }
  if (friend.id === id) {
    throw new Error('Нельзя добавить себя')
  }
  const existing = await database
    .selectFrom('friendships')
    .select('friendId')
    .where('userId', '=', id)
    .where('friendId', '=', friend.id)
    .executeTakeFirst()
  if (existing) {
    throw new Error('Этот человек уже в списке')
  }
  await database.insertInto('friendships').values({ userId: id, friendId: friend.id }).execute()
}
