'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'
import { addActivity, cardOf, todayActivity } from '@/sorse/query'
import type { Session } from '@/sorse/types'

const COMPLIMENT = 'Так держать — слова возвращаются вовремя.'

async function view(sessionId: string, ownerId: string): Promise<Session> {
  const session = await database
    .selectFrom('trainingSessions')
    .select(['id', 'cardIndex', 'correct', 'wrong', 'minutes'])
    .where('id', '=', sessionId)
    .where('userId', '=', ownerId)
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
    .where('id', '=', ownerId)
    .executeTakeFirstOrThrow()
  const today = await todayActivity(database, ownerId)
  return {
    id: session.id,
    index: Math.min(session.cardIndex, cards.length),
    total: cards.length,
    done,
    card: current ? await cardOf(database, ownerId, current.lemma) : null,
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

export default async function startSession(newWords: number, total: number): Promise<Session> {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  if (newWords < 0 || newWords > 30 || total < 5 || total > 50 || newWords > total) {
    throw new Error('Новых от 0 до 30, всего от 5 до 50, новых не больше всего')
  }
  const owned = await database.selectFrom('userWords').select(['lemma', 'wrong', 'mastered']).where('userId', '=', id).execute()
  const ownedLemmas = new Set(owned.map((item) => item.lemma))
  const fresh = await database.selectFrom('lemmas').select('lemma').orderBy('rank', 'asc').execute()
  const freshCards = fresh.filter((item) => !ownedLemmas.has(item.lemma)).slice(0, newWords).map((item) => item.lemma)
  const review = owned
    .filter((item) => !item.mastered)
    .sort((a, b) => b.wrong - a.wrong)
    .map((item) => item.lemma)
  const pool = [...freshCards, ...review]
  if (!pool.length) {
    throw new Error('В словаре пока нет слов')
  }
  const cards = pool.slice(0, total)
  while (cards.length < total) cards.push(pool[cards.length % pool.length])
  const created = await database.transaction().execute(async (trx) => {
    const session = await trx
      .insertInto('trainingSessions')
      .values({
        userId: id,
        cardIndex: 0,
        correct: 0,
        wrong: 0,
        minutes: Math.max(1, Math.round(total / 3)),
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    await trx
      .insertInto('trainingCards')
      .values(cards.map((lemma, position) => ({ sessionId: session.id, position, lemma })))
      .execute()
    return session.id
  })
  return view(created, id)
}
