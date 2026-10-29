'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'
import solver from '@/sorse/solver'
import { addActivity, cardOf, ensureWord, todayActivity } from '@/sorse/query'
import type { Session } from '@/sorse/types'

const COMPLIMENT = 'Так держать — слова возвращаются вовремя.'

export default async function reviewCard(sessionId: string, remembered: boolean): Promise<Session> {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
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
    .select(['lemma', 'position'])
    .where('sessionId', '=', sessionId)
    .orderBy('position', 'asc')
    .execute()
  if (session.cardIndex < cards.length) {
    const card = cards[session.cardIndex]
    await ensureWord(database, id, card.lemma, false)
    await solver('/review', { userId: id, lemma: card.lemma, remembered })
    const cardIndex = session.cardIndex + 1
    await database
      .updateTable('trainingSessions')
      .set({
        cardIndex,
        correct: session.correct + (remembered ? 1 : 0),
        wrong: session.wrong + (remembered ? 0 : 1),
      })
      .where('id', '=', sessionId)
      .execute()
    if (cardIndex >= cards.length) {
      await addActivity(database, id, session.minutes, cards.length)
    }
  }
  const fresh = await database
    .selectFrom('trainingSessions')
    .select(['id', 'cardIndex', 'correct', 'wrong', 'minutes'])
    .where('id', '=', sessionId)
    .where('userId', '=', id)
    .executeTakeFirst()
  if (!fresh) {
    throw new Error('Сессия не найдена')
  }
  const lemmas = await database
    .selectFrom('trainingCards')
    .select('lemma')
    .where('sessionId', '=', sessionId)
    .orderBy('position', 'asc')
    .execute()
  const done = fresh.cardIndex >= lemmas.length
  const current = lemmas[fresh.cardIndex]
  const upcoming = lemmas[fresh.cardIndex + 1]
  const profile = await database
    .selectFrom('profiles')
    .select(['streak', 'dailyGoalMin'])
    .where('id', '=', id)
    .executeTakeFirstOrThrow()
  const today = await todayActivity(database, id)
  return {
    id: fresh.id,
    index: Math.min(fresh.cardIndex, lemmas.length),
    total: lemmas.length,
    done,
    card: current ? await cardOf(database, id, current.lemma) : null,
    next: upcoming ? { lemma: upcoming.lemma } : null,
    summary: done
      ? {
          minutes: fresh.minutes,
          words: lemmas.length,
          correct: fresh.correct,
          wrong: fresh.wrong,
          streak: profile.streak,
          goalMin: profile.dailyGoalMin,
          todayMin: today.minutes,
          compliment: COMPLIMENT,
        }
      : null,
  }
}
