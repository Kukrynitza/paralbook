'use server'

import database from '@/modules/database'
import deleteText from '@/actions/Reading/deleteText'
import { cancelTextJob } from '@/sorse/textService'
import userId from '@/sorse/userId'

export default async function cancelJob(jobId: string, textId?: string) {
  const id = await userId()
  if (!id) throw new Error('Нужно войти')
  const job = await database
    .selectFrom('textJobs')
    .select(['id', 'textId', 'status'])
    .where('id', '=', jobId)
    .where('userId', '=', id)
    .executeTakeFirst()
  if (job) {
    await cancelTextJob(job.id).catch(() => undefined)
  }
  const target = textId || job?.textId
  if (target) {
    await deleteText(target).catch(() => undefined)
  }
  await database.deleteFrom('textJobs').where('id', '=', jobId).where('userId', '=', id).execute()
  return { ok: true }
}
