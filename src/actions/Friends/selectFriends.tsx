'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'
import { friendsOf, weekActivity } from '@/sorse/query'
import type { Friend, WeekActivity } from '@/sorse/types'

export default async function selectFriends(): Promise<{ items: Friend[]; me: WeekActivity }> {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  const [items, me] = await Promise.all([friendsOf(database, id), weekActivity(database, id)])
  return { items, me }
}
