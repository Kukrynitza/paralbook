'use server'

import database from '@/modules/database'
import deleteText from '@/actions/Reading/deleteText'
import { activeJobFor } from '@/sorse/jobs'
import { startChatJob } from '@/sorse/textService'
import { LEVELS, type Cefr } from '@/sorse/types'
import userId from '@/sorse/userId'

interface GenerateInput {
  topic: string
  minutes: number
  level: Cefr
}

async function rememberError(userIdValue: string, topic: string, minutes: number, level: Cefr, body: string) {
  await database
    .insertInto('chatMessages')
    .values({ userId: userIdValue, role: 'error', body, retryTopic: topic, retryMinutes: minutes, retryLevel: level })
    .execute()
}

export default async function generateText(input: GenerateInput) {
  const id = await userId()
  if (!id) throw new Error('Нужно войти')
  if (await activeJobFor(id)) {
    throw new Error('Дождитесь завершения текущей задачи')
  }
  const topic = input.topic.trim()
  if (!topic) throw new Error('Напишите тему')
  const level = LEVELS.includes(input.level) ? input.level : 'B1'
  const minutes = Math.min(60, Math.max(1, Math.round(input.minutes) || 5))
  const last = await database
    .selectFrom('chatMessages')
    .select('role')
    .where('userId', '=', id)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .executeTakeFirst()
  const textId = await database.transaction().execute(async (trx) => {
    const created = await trx
      .insertInto('texts')
      .values({
        ownerId: id,
        title: topic.slice(0, 80),
        excerpt: topic.slice(0, 500),
        minutes,
        level,
        topic,
        baseRating: 0,
        published: false,
        ready: false,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    await trx
      .insertInto('collectionItems')
      .values({ userId: id, textId: created.id, source: 'chat', progress: 0, credited: false })
      .execute()
    if (last?.role !== 'error') {
      await trx
        .insertInto('chatMessages')
        .values({ userId: id, role: 'user', body: `${topic}, ${minutes} минут, уровень ${level}` })
        .execute()
    }
    return created.id
  })
  try {
    const job = await startChatJob({ userId: id, textId, topic, minutes, level })
    return { jobId: job.id, textId }
  } catch (reason) {
    await deleteText(textId).catch(() => undefined)
    const message = reason instanceof Error ? reason.message : 'Модель не ответила. Повторите ещё раз.'
    await rememberError(id, topic, minutes, level, message)
    throw new Error(message)
  }
}
