'use server'

import userId from '@/sorse/userId'
import solver from '@/sorse/solver'
import type { DictEntry } from '@/sorse/types'

export default async function selectWord(word: string): Promise<DictEntry> {
  const id = await userId()
  if (!id) throw new Error('Нужно войти')
  return solver<DictEntry>(`/article?word=${encodeURIComponent(word)}`)
}
