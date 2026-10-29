'use server'

import userId from '@/sorse/userId'
import solver from '@/sorse/solver'
import type { Cefr } from '@/sorse/types'

export default async function uploadText(input: { title: string; topic: string; level: Cefr; body: string }) {
  const id = await userId()
  if (!id) throw new Error('Нужно войти')
  const saved = await solver<{ textId: string }>('/upload', { userId: id, ...input })
  return saved.textId
}
