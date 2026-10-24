'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'
import { ensureWord } from '@/sorse/query'

export default async function seedVocabulary(): Promise<{ added: { id: string }[] }> {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  const profile = await database.selectFrom('profiles').select('cefr').where('id', '=', id).executeTakeFirst()
  if (!profile) {
    throw new Error('Нужно войти')
  }
  const lemmas = await database
    .selectFrom('lemmaLevels')
    .select('lemma')
    .where('level', '=', profile.cefr)
    .orderBy('lemma', 'asc')
    .execute()
  const added: { id: string }[] = []
  for (const item of lemmas) {
    const existing = await database
      .selectFrom('userWords')
      .select('id')
      .where('userId', '=', id)
      .where('lemma', '=', item.lemma)
      .executeTakeFirst()
    if (existing) continue
    added.push({ id: await ensureWord(database, id, item.lemma, true) })
  }
  return { added }
}
