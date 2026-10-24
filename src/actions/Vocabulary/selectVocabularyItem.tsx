'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'
import { vocabById } from '@/sorse/query'
import type { VocabItem } from '@/sorse/types'

export default async function selectVocabularyItem(itemId: string): Promise<VocabItem> {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  return vocabById(database, id, itemId)
}
