'use server'

import { randomBytes } from 'node:crypto'
import database from '@/modules/database'
import userId from '@/sorse/userId'
import { friendsOf } from '@/sorse/query'
import type { Friend } from '@/sorse/types'

export default async function selectFriends(): Promise<{ items: Friend[]; code: string }> {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  const profile = await database.selectFrom('profiles').select('friendCode').where('id', '=', id).executeTakeFirst()
  let code = profile?.friendCode?.trim() ?? ''
  if (!code) {
    code = randomBytes(4).toString('hex')
    await database.updateTable('profiles').set({ friendCode: code }).where('id', '=', id).execute()
  }
  return { items: await friendsOf(database, id), code }
}
