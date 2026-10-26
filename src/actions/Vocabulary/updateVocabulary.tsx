'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'
import { vocabById } from '@/sorse/query'
import { HINT_MAX } from '@/sorse/hint'
import type { VocabItem } from '@/sorse/types'

export default async function updateVocabulary(itemId: string, patch: { hint?: string; mastered?: boolean }): Promise<VocabItem> {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  const current = await database
    .selectFrom('userWords')
    .select('id')
    .where('id', '=', itemId)
    .where('userId', '=', id)
    .executeTakeFirst()
  if (!current) {
    throw new Error('Слова нет в словаре')
  }
  const next: { hint?: string; mastered?: boolean } = {}
  if (patch.hint !== undefined) {
    const hint = patch.hint.trim()
    if (!hint) {
      throw new Error('Напишите подсказку перед сохранением')
    }
    if (hint.length > HINT_MAX) {
      throw new Error(`Подсказка короткая, до ${HINT_MAX} символов`)
    }
    next.hint = hint
  }
  if (patch.mastered) next.mastered = true
  if (next.hint !== undefined || next.mastered !== undefined) {
    await database.updateTable('userWords').set(next).where('id', '=', itemId).execute()
  }
  return vocabById(database, id, itemId)
}
