'use server'

import database from '@/modules/database'
import { isMissingTable } from '@/sorse/llmSettings'
import userId from '@/sorse/userId'

export default async function clearLlmSettings() {
  const id = await userId()
  if (!id) {
    return 'Нужно войти'
  }
  try {
    await database.deleteFrom('llmSettings').where('userId', '=', id).execute()
  } catch (reason) {
    if (!isMissingTable(reason)) throw reason
  }
}
