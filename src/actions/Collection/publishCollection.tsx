'use server'

import userId from '@/sorse/userId'
import { publishCollectionEntry } from '@/sorse/publishText'

export default async function publishCollection(entryId: string) {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  return publishCollectionEntry(id, entryId)
}
