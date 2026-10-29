'use server'

import { sql } from 'kysely'
import database from '@/modules/database'
import { shortHint } from '@/sorse/hint'
import { addActivity } from '@/sorse/query'
import userId from '@/sorse/userId'

const STEP = [
  "interval '30 minutes'",
  "interval '12 hours'",
  "interval '1 day'",
  "interval '7 days'",
  "interval '30 days'",
  "interval '60 days'",
] as const

function dueAtFor(step: number, remembered: boolean, mastered: boolean) {
  if (remembered && !mastered && step >= 1 && step <= STEP.length) return sql<Date>`now() + ${sql.raw(STEP[step - 1])}`
  return sql<Date>`now()`
}

export default async function practiceWord(lemma: string, remembered: boolean) {
  const id = await userId()
  if (!id) throw new Error('Нужно войти')
  const word = lemma.trim().toLowerCase()
  await database.transaction().execute(async (trx) => {
    const known = await trx.selectFrom('lemmas').select(['lemma', 'hint']).where('lemma', '=', word).executeTakeFirst()
    if (!known) throw new Error('Слова нет в словарной статье')
    const row = await trx
      .selectFrom('userWords')
      .select(['id', 'correct', 'wrong', 'intervalDays', 'ease', 'mastered'])
      .where('userId', '=', id)
      .where('lemma', '=', known.lemma)
      .executeTakeFirst()
    const ease = Number(row?.ease ?? 2.5)
    if (row?.mastered) return
    let correct = row?.correct ?? 0
    let wrong = row?.wrong ?? 0
    let step = row?.intervalDays ?? 0
    let mastered = false
    if (remembered) {
      correct += 1
      if (correct >= 6) {
        correct = 6
        mastered = true
        step = 6
      } else {
        step = correct
      }
    } else {
      wrong += 1
    }
    const dueAt = dueAtFor(step, remembered, mastered)
    if (row) {
      await trx
        .updateTable('userWords')
        .set({ correct, wrong, intervalDays: step, ease, dueAt, mastered })
        .where('id', '=', row.id)
        .execute()
      return
    }
    await trx
      .insertInto('userWords')
      .values({
        userId: id,
        lemma: known.lemma,
        hint: shortHint(known.hint ?? ''),
        correct,
        wrong,
        mastered,
        dueAt,
        intervalDays: step,
        ease,
      })
      .execute()
    await addActivity(trx, id, 0, 1)
  })
}
