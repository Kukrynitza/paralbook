'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'
import { ensureWord } from '@/sorse/query'
import { CONTEXT_MAX } from '@/sorse/context'

export default async function addVocabulary(lemma: string, context?: string) {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  const form = lemma.trim().toLowerCase()
  const clean = (context || '').replace(/\s+/g, ' ').trim().slice(0, CONTEXT_MAX)
  const existing = await database
    .selectFrom('userWords')
    .select('id')
    .where('userId', '=', id)
    .where('lemma', '=', form)
    .executeTakeFirst()
  if (existing) {
    await database.deleteFrom('userWords').where('id', '=', existing.id).where('userId', '=', id).execute()
    return { saved: false }
  }
  await ensureWord(database, id, form, true, clean)
  return { saved: true }
}
