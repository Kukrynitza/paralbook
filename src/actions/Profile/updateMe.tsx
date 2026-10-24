'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'
import type { Cefr, ThemePref } from '@/sorse/types'

interface ProfilePatch {
  cefr?: Cefr
  interests?: string[]
  dailyGoalMin?: number
  showMinutes?: boolean
  theme?: ThemePref
}

export default async function updateMe(patch: ProfilePatch) {
  const id = await userId()
  if (!id) {
    return
  }
  await database
    .updateTable('profiles')
    .set(patch)
    .where('id', '=', id)
    .execute()

  return database
    .selectFrom('profiles')
    .select(['id', 'email', 'cefr', 'interests', 'dailyGoalMin', 'showMinutes', 'theme', 'streak'])
    .where('id', '=', id)
    .executeTakeFirst()
}
