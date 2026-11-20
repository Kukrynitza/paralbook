'use server'

import { sql } from 'kysely'
import database from '@/modules/database'
import { nextReview, reviewMinutes, type StoredReviewState } from '@/sorse/intervals'
import { shortHint } from '@/sorse/hint'
import { addActivity } from '@/sorse/query'
import userId from '@/sorse/userId'

function dueAtFor(state: StoredReviewState, remembered: boolean) {
  if (!remembered || state.mastered || state.intervalDays < 1) return sql<Date>`now()`
  const minutes = reviewMinutes(state.intervalDays)
  if (minutes === null) return sql<Date>`now()`
  return sql<Date>`now() + (${minutes} * interval '1 minute')`
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
    const state = nextReview(row, remembered)
    if (!state) return
    const dueAt = dueAtFor(state, remembered)
    const ease = Number(row?.ease ?? 2.5)
    if (row) {
      await trx
        .updateTable('userWords')
        .set({
          correct: state.correct,
          wrong: state.wrong,
          intervalDays: state.intervalDays,
          ease,
          dueAt,
          mastered: state.mastered,
        })
        .where('id', '=', row.id)
        .execute()
      return
    }
    const created = await trx
      .insertInto('userWords')
      .values({
        userId: id,
        lemma: known.lemma,
        hint: shortHint(known.hint ?? ''),
        correct: state.correct,
        wrong: state.wrong,
        mastered: state.mastered,
        dueAt,
        intervalDays: state.intervalDays,
        ease,
      })
      .onConflict((conflict) => conflict.doNothing())
      .returning('id')
      .executeTakeFirst()
    if (created) {
      await addActivity(trx, id, 0, 1)
      return
    }
    const raced = await trx
      .selectFrom('userWords')
      .select(['id', 'correct', 'wrong', 'intervalDays', 'ease', 'mastered'])
      .where('userId', '=', id)
      .where('lemma', '=', known.lemma)
      .executeTakeFirst()
    const racedState = nextReview(raced, remembered)
    if (!raced || !racedState) return
    await trx
      .updateTable('userWords')
      .set({
        correct: racedState.correct,
        wrong: racedState.wrong,
        intervalDays: racedState.intervalDays,
        ease: Number(raced.ease ?? 2.5),
        dueAt: dueAtFor(racedState, remembered),
        mastered: racedState.mastered,
      })
      .where('id', '=', raced.id)
      .execute()
  })
}
