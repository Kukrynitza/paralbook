'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'
import { averageScore } from '@/sorse/query'

export default async function voteLibrary(textId: string, score: number) {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    throw new Error('Оценка от 1 до 5')
  }
  const saved = await database
    .selectFrom('collectionItems')
    .select('id')
    .where('userId', '=', id)
    .where('textId', '=', textId)
    .executeTakeFirst()
  if (!saved) {
    throw new Error('Сначала добавьте текст в подборку')
  }
  const current = await database
    .selectFrom('votes')
    .select('score')
    .where('userId', '=', id)
    .where('textId', '=', textId)
    .executeTakeFirst()
  if (current && Number(current.score) === score) {
    await database.deleteFrom('votes').where('userId', '=', id).where('textId', '=', textId).execute()
  } else {
    await database
      .insertInto('votes')
      .values({ userId: id, textId, score })
      .onConflict((conflict) => conflict.columns(['userId', 'textId']).doUpdateSet({ score }))
      .execute()
  }
  const votes = await database.selectFrom('votes').select(['userId', 'score']).where('textId', '=', textId).execute()
  const mine = votes.find((item) => item.userId === id)
  return {
    textId,
    rating: averageScore(votes.map((item) => Number(item.score))),
    score: mine ? Number(mine.score) : null,
  }
}
