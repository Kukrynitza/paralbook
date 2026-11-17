'use server'

import database from '@/modules/database'
import { normalizeTheme, type ThemePrefs } from '@/sorse/themeTypes'
import userId from '@/sorse/userId'

export default async function saveTheme(input: ThemePrefs): Promise<ThemePrefs> {
  const id = await userId()
  if (!id) throw new Error('Нужно войти')
  const prefs = normalizeTheme(input)
  await database
    .insertInto('userThemes')
    .values({ userId: id, prefs })
    .onConflict((conflict) => conflict.column('userId').doUpdateSet({ prefs, updatedAt: new Date() }))
    .execute()
  return prefs
}
