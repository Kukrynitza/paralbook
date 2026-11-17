'use server'

import database from '@/modules/database'
import deleteText from '@/actions/Reading/deleteText'
import { createImport } from '@/sorse/importStart'
import { LEVELS, type Cefr } from '@/sorse/types'
import userId from '@/sorse/userId'

interface ImportPayload {
  title?: string
  topic?: string
  level?: Cefr
  source?: 'upload' | 'text'
  text?: string
  russian?: string
  chunkUnit?: 'sentences' | 'tokens'
  chunkSize?: number
}

function levelOf(value: unknown): Cefr {
  return LEVELS.includes(value as Cefr) ? (value as Cefr) : 'B1'
}

export default async function retryImport(jobId: string) {
  const id = await userId()
  if (!id) throw new Error('Нужно войти')
  const job = await database
    .selectFrom('textJobs')
    .select(['id', 'textId', 'payload'])
    .where('id', '=', jobId)
    .where('userId', '=', id)
    .executeTakeFirst()
  if (!job) throw new Error('Задание не найдено')
  const payload = (job.payload && typeof job.payload === 'object' ? job.payload : {}) as ImportPayload
  if (job.textId) {
    await deleteText(job.textId).catch(() => undefined)
  }
  await database.deleteFrom('textJobs').where('id', '=', jobId).where('userId', '=', id).execute()
  if (!payload.text) {
    return { upload: true as const }
  }
  const title = payload.title || 'Свой текст'
  const start = await createImport(id, {
    title,
    topic: payload.topic || '',
    level: levelOf(payload.level),
    source: 'text',
  })
  const response = await fetch(`${start.serviceUrl}/v1/jobs/import/text`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${start.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: payload.text,
      russian: payload.russian || null,
      translate: true,
      source: 'text',
      chunkUnit: payload.chunkUnit || 'tokens',
      chunkSize: payload.chunkSize || 1200,
    }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    await deleteText(start.textId).catch(() => undefined)
    const detail = data && typeof data === 'object' && 'detail' in data ? String((data as { detail: unknown }).detail) : ''
    throw new Error(detail || 'Не удалось повторить импорт')
  }
  return { jobId: start.jobId, textId: start.textId, title }
}
