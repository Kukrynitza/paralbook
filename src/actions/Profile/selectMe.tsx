'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'
export default async function selectMe() {
  const id = await userId()
  if (!id) {
    return
  }

  return database
    .selectFrom('profiles')
    .select(['id', 'email', 'cefr', 'interests', 'dailyGoalMin', 'showMinutes', 'theme', 'streak'])
    .where('id', '=', id)
    .executeTakeFirst()
}
