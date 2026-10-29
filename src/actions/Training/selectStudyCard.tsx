'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'
import { cardOf } from '@/sorse/query'
import type { SessionCard } from '@/sorse/types'

export default async function selectStudyCard(lemma: string): Promise<SessionCard> {
  const id = await userId()
  if (!id) throw new Error('Нужно войти')
  const card = await cardOf(database, id, lemma)
  if (!card) throw new Error('Слова нет в базе знаний')
  return card
}
