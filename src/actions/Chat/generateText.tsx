'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'
import solver from '@/sorse/solver'
import type { Cefr } from '@/sorse/types'

export default async function generateText(input: { topic: string; minutes: number; level: Cefr }) {
  const id = await userId()
  if (!id) throw new Error('Нужно войти')
  const profile = await database.selectFrom('profiles').select('interests').where('id', '=', id).executeTakeFirst()
  const saved = await solver<{ textId: string | null }>('/generate', {
    userId: id,
    ...input,
    interests: profile?.interests ?? [],
  })
  return saved.textId
}
