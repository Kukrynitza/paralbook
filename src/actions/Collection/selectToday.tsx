'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'
import { friendsOf, todayActivity } from '@/sorse/query'
import type { Today } from '@/sorse/types'

export default async function selectToday(): Promise<Today> {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  const [profile, today, friends] = await Promise.all([
    database
      .selectFrom('profiles')
      .select('dailyGoalMin')
      .where('id', '=', id)
      .executeTakeFirst(),
    todayActivity(database, id),
    friendsOf(database, id),
  ])
  if (!profile) {
    throw new Error('Нужно войти')
  }
  return {
    readingMin: today.minutes,
    words: today.words,
    goalMin: profile.dailyGoalMin,
    friends: friends.slice(0, 2),
  }
}
