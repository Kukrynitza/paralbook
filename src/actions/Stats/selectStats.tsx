'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'
import { dayKey, touchStreak } from '@/sorse/query'
import type { StatBar, StatTotals, Stats, StatsRange } from '@/sorse/types'
import { sql } from 'kysely'

const RANGES: StatsRange[] = ['7', '30', '90', 'year', 'all']
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

function shiftDay(iso: string, delta: number) {
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + delta)
  return date.toISOString().slice(0, 10)
}

function monthKey(iso: string) {
  return iso.slice(0, 7)
}

function shiftMonth(key: string, delta: number) {
  const [year, month] = key.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1 + delta, 1))
  return date.toISOString().slice(0, 7)
}

function dayLabel(iso: string) {
  const [, month, day] = iso.split('-')
  return `${day}.${month}`
}

function monthLabel(key: string) {
  const [year, month] = key.split('-')
  return `${MONTHS[Number(month) - 1]} ${year.slice(2)}`
}

function buckets(range: StatsRange, today: string, earliest: string) {
  if (range === 'year' || range === 'all') {
    const end = monthKey(today)
    const start = range === 'year' ? shiftMonth(end, -11) : monthKey(earliest || today)
    const keys: string[] = []
    let cursor = start
    while (cursor <= end && keys.length < 240) {
      keys.push(cursor)
      cursor = shiftMonth(cursor, 1)
    }
    return keys.map((key) => ({ key, label: monthLabel(key), monthly: true }))
  }
  const length = range === '30' ? 30 : range === '90' ? 90 : 7
  const start = shiftDay(today, 1 - length)
  return Array.from({ length }, (_, index) => {
    const key = shiftDay(start, index)
    return { key, label: dayLabel(key), monthly: false }
  })
}

function bucketKey(day: string, monthly: boolean) {
  return monthly ? monthKey(day) : day
}

export default async function selectStats(range: StatsRange = '7'): Promise<Stats> {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  const period = RANGES.includes(range) ? range : '7'
  await touchStreak(database, id)
  const profile = await database
    .selectFrom('profiles')
    .select(['streak', 'dailyGoalMin'])
    .where('id', '=', id)
    .executeTakeFirst()
  if (!profile) {
    throw new Error('Нужно войти')
  }
  const todayRow = await sql<{ day: string }>`select current_date::text as day`.execute(database)
  const today = String(todayRow.rows[0]?.day ?? '').slice(0, 10)
  const weekStart = shiftDay(today, -6)
  const rows = await sql<{ day: string; minutes: number; words: number }>`
    select day::text as day, minutes::int as minutes, words::int as words
    from activity_days
    where user_id = ${id}
  `.execute(database)
  const knownRows = await sql<{ day: string; n: number }>`
    select (due_at - interval '30 minutes')::date::text as day, count(*)::int as n
    from user_words
    where user_id = ${id}
      and correct = 1 and wrong = 0 and interval_days = 1 and mastered = false
    group by 1
  `.execute(database)
  const reviewedRows = await sql<{ day: string; n: number }>`
    select day::text as day, count(*)::int as n
    from (
      select (
        due_at - case interval_days
          when 1 then interval '30 minutes'
          when 2 then interval '12 hours'
          when 3 then interval '1 day'
          when 4 then interval '7 days'
          when 5 then interval '30 days'
          else interval '60 days'
        end
      )::date as day
      from user_words
      where user_id = ${id}
        and mastered = false
        and interval_days between 1 and 6
        and not (correct = 1 and wrong = 0 and interval_days = 1)
    ) steps
    group by day
  `.execute(database)
  const masteredRows = await sql<{ day: string; n: number }>`
    select due_at::date::text as day, count(*)::int as n
    from user_words
    where user_id = ${id} and mastered = true and due_at is not null
    group by 1
  `.execute(database)
  const counts = await sql<{ fresh: number; reviewed: number; known: number; mastered: number; weekMastered: number }>`
    select
      count(*) filter (where not (correct = 1 and wrong = 0 and interval_days = 1 and mastered = false))::int as fresh,
      count(*) filter (
        where (interval_days >= 1 or mastered)
          and not (correct = 1 and wrong = 0 and interval_days = 1 and mastered = false)
      )::int as reviewed,
      count(*) filter (where correct = 1 and wrong = 0 and interval_days = 1 and mastered = false)::int as known,
      count(*) filter (where mastered or correct >= 6)::int as mastered,
      count(*) filter (
        where (mastered or correct >= 6)
          and due_at >= current_date - 6
          and due_at < current_date + 1
      )::int as week_mastered
    from user_words
    where user_id = ${id}
  `.execute(database)
  const added = new Map(rows.rows.map((item) => [dayKey(item.day), Number(item.words)]))
  const minutes = new Map(rows.rows.map((item) => [dayKey(item.day), Number(item.minutes)]))
  const known = new Map(knownRows.rows.map((item) => [dayKey(item.day), Number(item.n)]))
  const reviewed = new Map(reviewedRows.rows.map((item) => [dayKey(item.day), Number(item.n)]))
  const mastered = new Map(masteredRows.rows.map((item) => [dayKey(item.day), Number(item.n)]))
  const earliest = [...added.keys(), ...known.keys(), ...reviewed.keys(), ...mastered.keys()].sort()[0] || today
  const monthly = period === 'year' || period === 'all'
  const bars = buckets(period, today, earliest)
  const chart: StatBar[] = bars.map((item) => ({ label: item.label, fresh: 0, reviewed: 0, known: 0, mastered: 0 }))
  const index = new Map(bars.map((item, position) => [item.key, position]))
  const touch = (day: string, field: 'fresh' | 'reviewed' | 'known' | 'mastered', value: number) => {
    const slot = index.get(bucketKey(day, monthly))
    if (slot === undefined) return
    chart[slot][field] += value
  }
  for (const [day, value] of added) {
    const knew = known.get(day) ?? 0
    touch(day, 'fresh', Math.max(0, value - knew))
  }
  for (const [day, value] of known) touch(day, 'known', value)
  for (const [day, value] of reviewed) touch(day, 'reviewed', value)
  for (const [day, value] of mastered) touch(day, 'mastered', value)
  const weekBars = buckets('7', today, today)
  const week: StatTotals = { fresh: 0, reviewed: 0, known: 0, mastered: Number(counts.rows[0]?.weekMastered ?? 0) }
  for (const item of weekBars) {
    const knew = known.get(item.key) ?? 0
    week.fresh += Math.max(0, (added.get(item.key) ?? 0) - knew)
    week.known += knew
    week.reviewed += reviewed.get(item.key) ?? 0
  }
  const totalRow = counts.rows[0]
  const totals: StatTotals = {
    fresh: Number(totalRow?.fresh ?? 0),
    reviewed: Number(totalRow?.reviewed ?? 0),
    known: Number(totalRow?.known ?? 0),
    mastered: Number(totalRow?.mastered ?? 0),
  }
  const weekMinutes = [...minutes.entries()].reduce((sum, [day, value]) => (day >= weekStart && day <= today ? sum + value : sum), 0)
  const todayMin = minutes.get(today) ?? 0
  return {
    streak: profile.streak,
    days: chart,
    weekMinutes,
    goalMin: profile.dailyGoalMin,
    todayMin,
    leftMin: Math.max(0, profile.dailyGoalMin - todayMin),
    totals,
    week,
  }
}
