'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'
import { dayKey, recentDays } from '@/sorse/query'
import type { Stats } from '@/sorse/types'
import { sql } from 'kysely'

export default async function selectStats(): Promise<Stats> {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  const profile = await database
    .selectFrom('profiles')
    .select(['streak', 'dailyGoalMin'])
    .where('id', '=', id)
    .executeTakeFirst()
  if (!profile) {
    throw new Error('Нужно войти')
  }
  const days = recentDays()
  const rows = await database
    .selectFrom('activityDays')
    .select(['day', 'minutes'])
    .where('userId', '=', id)
    .where(sql<boolean>`day >= current_date - 6`)
    .execute()
  const minutes = new Map(rows.map((item) => [dayKey(item.day), Number(item.minutes)]))
  const chart = days.map((item) => ({ label: item.label, minutes: minutes.get(item.key) ?? 0 }))
  const todayMin = chart[chart.length - 1]?.minutes ?? 0
  return {
    streak: profile.streak,
    days: chart,
    weekMinutes: chart.reduce((sum, item) => sum + item.minutes, 0),
    goalMin: profile.dailyGoalMin,
    todayMin,
    leftMin: Math.max(0, profile.dailyGoalMin - todayMin),
  }
}
