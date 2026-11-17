'use server'

import { createImport } from '@/sorse/importStart'
import type { Cefr } from '@/sorse/types'
import userId from '@/sorse/userId'

interface StartImportInput {
  title: string
  topic: string
  level: Cefr
  source?: 'upload' | 'text'
}

export default async function startImport(input: StartImportInput) {
  const id = await userId()
  if (!id) throw new Error('Нужно войти')
  return createImport(id, input)
}
