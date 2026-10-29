'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'
import solver from '@/sorse/solver'

export default async function seedVocabulary(): Promise<{ added: { id: string }[] }> {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  const profile = await database.selectFrom('profiles').select('cefr').where('id', '=', id).executeTakeFirst()
  if (!profile) {
    throw new Error('Нужно войти')
  }
  const seeded = await solver<{ ids: string[] }>('/vocabulary/seed', { userId: id, level: profile.cefr })
  return { added: seeded.ids.map((item) => ({ id: item })) }
}
