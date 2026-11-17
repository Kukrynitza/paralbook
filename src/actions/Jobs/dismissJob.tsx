'use server'

import database from '@/modules/database'
import deleteText from '@/actions/Reading/deleteText'
import userId from '@/sorse/userId'

export default async function dismissJob(jobId: string) {
  const id = await userId()
  if (!id) throw new Error('Нужно войти')
  const job = await database
    .selectFrom('textJobs')
    .select(['id', 'textId'])
    .where('id', '=', jobId)
    .where('userId', '=', id)
    .executeTakeFirst()
  if (job?.textId) {
    await deleteText(job.textId).catch(() => undefined)
  }
  await database.deleteFrom('textJobs').where('id', '=', jobId).where('userId', '=', id).execute()
  return { ok: true }
}
