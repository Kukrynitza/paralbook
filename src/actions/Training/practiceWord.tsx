'use server'

import userId from '@/sorse/userId'
import solver from '@/sorse/solver'

export default async function practiceWord(lemma: string, remembered: boolean) {
  const id = await userId()
  if (!id) throw new Error('Нужно войти')
  return solver('/review', { userId: id, lemma, remembered })
}
