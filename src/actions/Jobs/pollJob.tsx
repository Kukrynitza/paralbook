'use server'

import database from '@/modules/database'
import deleteText from '@/actions/Reading/deleteText'
import cancelImport from '@/actions/Reading/cancelImport'
import { getTextJob } from '@/sorse/textService'
import type { Cefr } from '@/sorse/types'
import userId from '@/sorse/userId'

interface ChatPayload {
  topic?: string
  minutes?: number
  level?: Cefr
}

export default async function pollJob(jobId: string) {
  const id = await userId()
  if (!id) throw new Error('Нужно войти')
  let job
  try {
    job = await getTextJob(jobId)
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : ''
    if (message.includes('не найдено')) {
      await database.deleteFrom('textJobs').where('id', '=', jobId).where('userId', '=', id).execute()
      return {
        id: jobId,
        userId: id,
        type: 'import' as const,
        status: 'cancelled' as const,
        stage: 'cancelled',
        progress: 100,
        textId: null,
        error: 'Задание отменено',
        payload: null,
        result: null,
      }
    }
    throw reason
  }
  if (job.userId !== id) throw new Error('Нет доступа к заданию')

  if (job.status === 'cancelled') {
    if (job.textId) {
      await cancelImport(job.textId)
    }
    await database.deleteFrom('textJobs').where('id', '=', jobId).where('userId', '=', id).execute()
    return { ...job, status: 'cancelled' as const, error: job.error || 'Задание отменено' }
  }

  if (job.status === 'error') {
    if (job.type === 'chat') {
      if (job.textId) await deleteText(job.textId).catch(() => undefined)
      const payload = (job.payload && typeof job.payload === 'object' ? job.payload : {}) as ChatPayload
      const topic = payload.topic ?? ''
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
            retryMinutes: payload.minutes ?? 5,
            retryLevel: payload.level ?? 'B1',
          })
          .execute()
      }
      await database.deleteFrom('textJobs').where('id', '=', jobId).where('userId', '=', id).execute()
    } else if (job.textId) {
      await database
        .updateTable('textJobs')
        .set({ textId: null })
        .where('id', '=', jobId)
        .where('userId', '=', id)
        .execute()
      await deleteText(job.textId).catch(() => undefined)
    }
    return { ...job, status: 'error' as const, error: job.error || 'Не удалось обработать текст' }
  }

  if (job.status === 'done') {
    if (job.type === 'chat' && job.textId) {
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
    }
    await database.deleteFrom('textJobs').where('id', '=', jobId).where('userId', '=', id).execute()
  }
  return job
}
