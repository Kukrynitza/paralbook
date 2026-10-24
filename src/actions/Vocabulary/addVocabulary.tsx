'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'
import { ensureWord } from '@/sorse/query'

export default async function addVocabulary(lemma: string) {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  await ensureWord(database, id, lemma, true)
}
