'use server'

import database from '@/modules/database'
import deleteText from '@/actions/Reading/deleteText'
import type { Cefr } from '@/sorse/types'
import userId from '@/sorse/userId'

interface JobPayload {
  topic?: string
  minutes?: number
  level?: Cefr
}

export default async function syncChatJobs() {
  const id = await userId()
  if (!id) return
  const jobs = await database
    .selectFrom('textJobs')
    .select(['id', 'textId', 'status', 'error', 'payload'])
    .where('userId', '=', id)
    .where('type', '=', 'chat')
    .where('status', 'in', ['done', 'error'])
    .orderBy('createdAt', 'desc')
    .limit(20)
    .execute()

  for (const job of jobs) {
    const payload = (job.payload && typeof job.payload === 'object' ? job.payload : {}) as JobPayload
    const topic = payload.topic ?? ''
    const minutes = payload.minutes ?? 5
    const level = payload.level ?? 'B1'
    if (!job.textId) {
      await database.deleteFrom('textJobs').where('id', '=', job.id).where('userId', '=', id).execute()
      continue
    }
    if (job.status === 'done') {
      const existing = await database
        .selectFrom('chatMessages')
        .select('id')
        .where('userId', '=', id)
        .where('role', '=', 'result')
        .where('textId', '=', job.textId)
        .executeTakeFirst()
      if (!existing) {
        await database.insertInto('chatMessages').values({ userId: id, role: 'result', textId: job.textId }).execute()
      }
    } else {
      await deleteText(job.textId).catch(() => undefined)
      const message = job.error || 'Модель не ответила. Повторите ещё раз.'
      const existing = await database
        .selectFrom('chatMessages')
        .select('id')
        .where('userId', '=', id)
        .where('role', '=', 'error')
        .where('body', '=', message)
        .where('retryTopic', '=', topic)
        .executeTakeFirst()
      if (!existing) {
        await database
          .insertInto('chatMessages')
          .values({
            userId: id,
            role: 'error',
            body: message,
            retryTopic: topic,
            retryMinutes: minutes,
            retryLevel: level,
          })
          .execute()
      }
    }
    await database.deleteFrom('textJobs').where('id', '=', job.id).where('userId', '=', id).execute()
  }
}
