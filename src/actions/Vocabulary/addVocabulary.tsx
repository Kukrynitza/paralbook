'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'
import { ensureWord } from '@/sorse/query'

export default async function addVocabulary(
  input:
    | string
    | {
        lemma: string
        senseId?: string | null
        contextEn?: string | null
        contextRu?: string | null
        disagreement?: boolean
      },
) {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  const lemma = typeof input === 'string' ? input : input.lemma
  const extra = typeof input === 'string' ? undefined : input
  await ensureWord(database, id, lemma, true, extra)
}
