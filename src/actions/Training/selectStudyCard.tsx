'use server'

import database from '@/modules/database'
import { cardOf } from '@/sorse/query'
import userId from '@/sorse/userId'

export default async function selectStudyCard(lemma: string) {
  const id = await userId()
  if (!id) throw new Error('Нужно войти')
  const card = await cardOf(database, id, lemma.trim().toLowerCase())
  if (!card) throw new Error('Слова нет в словарной статье')
  return card
}
