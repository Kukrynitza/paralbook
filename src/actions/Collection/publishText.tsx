'use server'

import userId from '@/sorse/userId'
import { publishTextEntry } from '@/sorse/publishText'

export default async function publishText(textId: string) {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  return publishTextEntry(id, textId)
}
