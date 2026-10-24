'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'
import { vocabById, vocabTone } from '@/sorse/query'
import type { VocabItem } from '@/sorse/types'
import { sql } from 'kysely'

export default async function selectVocabulary(query: string, status: string): Promise<{ items: VocabItem[] }> {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  const needle = query.trim().replace(/[%_\\]/g, '')
  let rowsQuery = database
    .selectFrom('userWords')
    .innerJoin('lemmas', 'lemmas.lemma', 'userWords.lemma')
    .select([
      'userWords.id',
      'userWords.lemma',
      'userWords.hint',
      'userWords.correct',
      'userWords.wrong',
      'userWords.mastered',
      'lemmas.ipa',
      'lemmas.translation',
      'lemmas.example',
    ])
    .where('userWords.userId', '=', id)
    
  if (needle) {
    const pattern = `%${needle}%`
    rowsQuery = rowsQuery.where(sql<boolean>`(user_words.lemma ilike ${pattern} or lemmas.example ilike ${pattern})`)
  }
  if (status === 'ok') {
    rowsQuery = rowsQuery.whereRef('userWords.correct', '>', 'userWords.wrong')
  }
  if (status === 'error') {
    rowsQuery = rowsQuery.where('userWords.wrong', '>', 0).whereRef('userWords.wrong', '>=', 'userWords.correct')
  }
  const rows = await rowsQuery.orderBy('userWords.lemma', 'asc').execute()
  return {
    items: rows.map((row) => ({
      id: row.id,
      lemma: row.lemma,
      ipa: row.ipa,
      translation: row.translation,
      example: row.example,
      hint: row.hint,
      correct: row.correct,
      wrong: row.wrong,
      mastered: row.mastered,
      tone: vocabTone(row.correct, row.wrong),
    })),
  }
}
