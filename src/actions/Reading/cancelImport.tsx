'use server'

import deleteText from '@/actions/Reading/deleteText'

export default async function cancelImport(textId: string) {
  try {
    await deleteText(textId)
  } catch {
    // импорт мог уже удалиться или не создать страницы
  }
  return { ok: true }
}
