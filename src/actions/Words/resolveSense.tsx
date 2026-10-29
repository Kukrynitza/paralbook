'use server'

import userId from '@/sorse/userId'
import solver from '@/sorse/solver'

export interface ResolvedSense {
  inKb: boolean
  lemma: string | null
  senseId: string | null
  translation: string | null
  disagreement: boolean
  reason: string
  memory: string | null
  sentence: string
  sentenceRu: string
}

export default async function resolveSense(input: { word: string; sentence: string; sentenceRu?: string }): Promise<ResolvedSense> {
  const id = await userId()
  if (!id) throw new Error('Нужно войти')
  return solver<ResolvedSense>('/sense', {
    word: input.word,
    sentence: input.sentence,
    sentenceRu: input.sentenceRu ?? '',
  })
}
