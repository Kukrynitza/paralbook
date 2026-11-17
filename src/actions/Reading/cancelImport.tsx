'use server'

import database from '@/modules/database'
import deleteText from '@/actions/Reading/deleteText'
import { cancelTextJob } from '@/sorse/textService'
import userId from '@/sorse/userId'

export default async function cancelImport(textId: string) {
  const id = await userId()
  if (!id) return { ok: false }
  const active = await database
    .selectFrom('textJobs')
    .select('id')
    .where('userId', '=', id)
    .where('textId', '=', textId)
    .where('status', 'in', ['uploading', 'queued', 'running'])
    .execute()
  for (const job of active) {
    await cancelTextJob(job.id).catch(() => undefined)
  }
  await deleteText(textId).catch(() => undefined)
  return { ok: true }
}
