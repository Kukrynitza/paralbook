'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'

export default async function listJobs() {
  const id = await userId()
  if (!id) return []
  const rows = await database
    .selectFrom('textJobs')
    .leftJoin('texts', 'texts.id', 'textJobs.textId')
    .select([
      'textJobs.id',
      'textJobs.textId',
      'textJobs.type',
      'textJobs.status',
      'textJobs.stage',
      'textJobs.progress',
      'textJobs.error',
      'textJobs.createdAt',
      'textJobs.payload',
      'texts.title',
    ])
    .where('textJobs.userId', '=', id)
    .where('textJobs.status', 'in', ['uploading', 'queued', 'running'])
    .orderBy('textJobs.createdAt', 'desc')
    .limit(20)
    .execute()
  return rows
    .filter((row) => row.textId)
    .map((row) => {
      const payload = (row.payload && typeof row.payload === 'object' ? row.payload : {}) as { title?: string }
      return {
        id: row.id,
        textId: row.textId as string,
        type: row.type === 'chat' ? ('chat' as const) : ('import' as const),
        title: row.title ?? payload.title ?? 'Текст',
        status: row.status,
        stage: row.stage,
        progress: row.progress,
        error: row.error,
      }
    })
}
