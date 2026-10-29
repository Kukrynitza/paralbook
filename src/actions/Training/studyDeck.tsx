'use server'

import userId from '@/sorse/userId'
import solver from '@/sorse/solver'

export interface StudyDeck {
  lemmas: string[]
  mode: string
  nextMinutes: number | null
  nextDueAt: string | null
  newToday: number
  streak: number
  today: { new: number; reviewed: number; known: number; mastered: number }
}

export default async function studyDeck(packs: string[], mode = '', daily = 10, extra = false): Promise<StudyDeck> {
  const id = await userId()
  if (!id) throw new Error('Нужно войти')
  const query = new URLSearchParams({
    userId: id,
    packs: packs.join(','),
    mode,
    daily: String(daily),
  })
  if (extra) query.set('extra', '1')
  return solver<StudyDeck>(`/study?${query.toString()}`)
}
