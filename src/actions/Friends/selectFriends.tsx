'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'
import { friendsOf } from '@/sorse/query'
import type { Friend } from '@/sorse/types'

export default async function selectFriends(): Promise<{ items: Friend[] }> {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  return { items: await friendsOf(database, id) }
}
