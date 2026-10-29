'use server'

import database from '@/modules/database'
import { addActivity } from '@/sorse/query'
import userId from '@/sorse/userId'

export default async function recordStudy(minutes: number) {
  const id = await userId()
  if (!id) return
  const value = Math.max(1, Math.min(180, Math.round(minutes || 0)))
  await addActivity(database, id, value, 0)
}
