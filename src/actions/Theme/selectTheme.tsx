'use server'

import database from '@/modules/database'
import type { ThemePrefs } from '@/sorse/themeTypes'
import userId from '@/sorse/userId'

function missingTable(reason: unknown) {
  return Boolean(reason && typeof reason === 'object' && 'code' in reason && (reason as { code?: string }).code === '42P01')
}

export default async function selectTheme(): Promise<ThemePrefs | null> {
  const id = await userId()
  if (!id) throw new Error('Нужно войти')
  try {
    const row = await database
      .selectFrom('userThemes')
      .select('prefs')
      .where('userId', '=', id)
      .executeTakeFirst()
    return (row?.prefs as ThemePrefs | undefined) ?? null
  } catch (reason) {
    if (missingTable(reason)) return null
    throw reason
  }
}
