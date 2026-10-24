'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'
import { addActivity, cardOf, ensureWord, todayActivity } from '@/sorse/query'
import type { Session } from '@/sorse/types'

const COMPLIMENT = 'Так держать — слова возвращаются вовремя.'

export default async function reviewCard(sessionId: string, remembered: boolean): Promise<Session> {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  await database.transaction().execute(async (trx) => {
    const session = await trx
      .selectFrom('trainingSessions')
      .select(['id', 'cardIndex', 'correct', 'wrong', 'minutes'])
      .where('id', '=', sessionId)
      .where('userId', '=', id)
      .executeTakeFirst()
    if (!session) {
      throw new Error('Сессия не найдена')
    }
    const cards = await trx
      .selectFrom('trainingCards')
      .select(['lemma', 'position'])
      .where('sessionId', '=', sessionId)
      .orderBy('position', 'asc')
      .execute()
    if (session.cardIndex >= cards.length) return
    const card = cards[session.cardIndex]
    await ensureWord(trx, id, card.lemma, false)
    const word = await trx
      .selectFrom('userWords')
      .select(['id', 'correct', 'wrong'])
      .where('userId', '=', id)
      .where('lemma', '=', card.lemma)
      .executeTakeFirstOrThrow()
    await trx
      .updateTable('userWords')
      .set(remembered ? { correct: word.correct + 1 } : { wrong: word.wrong + 1 })
      .where('id', '=', word.id)
      .execute()
    const cardIndex = session.cardIndex + 1
    await trx
      .updateTable('trainingSessions')
      .set({
        cardIndex,
        correct: session.correct + (remembered ? 1 : 0),
        wrong: session.wrong + (remembered ? 0 : 1),
      })
      .where('id', '=', sessionId)
      .execute()
    if (cardIndex >= cards.length) {
      await addActivity(trx, id, session.minutes, cards.length)
    }
  })
  const session = await database
    .selectFrom('trainingSessions')
    .select(['id', 'cardIndex', 'correct', 'wrong', 'minutes'])
    .where('id', '=', sessionId)
    .where('userId', '=', id)
    .executeTakeFirst()
  if (!session) {
    throw new Error('Сессия не найдена')
  }
  const cards = await database
    .selectFrom('trainingCards')
    .select('lemma')
    .where('sessionId', '=', sessionId)
    .orderBy('position', 'asc')
    .execute()
  const done = session.cardIndex >= cards.length
  const current = cards[session.cardIndex]
  const upcoming = cards[session.cardIndex + 1]
  const profile = await database
    .selectFrom('profiles')
    .select(['streak', 'dailyGoalMin'])
    .where('id', '=', id)
    .executeTakeFirstOrThrow()
  const today = await todayActivity(database, id)
  return {
    id: session.id,
    index: Math.min(session.cardIndex, cards.length),
    total: cards.length,
    done,
    card: current ? await cardOf(database, id, current.lemma) : null,
    next: upcoming ? { lemma: upcoming.lemma } : null,
    summary: done
      ? {
          minutes: session.minutes,
          words: cards.length,
          correct: session.correct,
          wrong: session.wrong,
          streak: profile.streak,
          goalMin: profile.dailyGoalMin,
          todayMin: today.minutes,
          compliment: COMPLIMENT,
        }
      : null,
  }
}
