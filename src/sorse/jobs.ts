import database from '@/modules/database'

const STALE_AFTER_MS = 10 * 60 * 1000

export async function activeJobFor(userId: string) {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS)
  return database
    .selectFrom('textJobs')
    .select(['id', 'type', 'textId', 'status', 'progress', 'updatedAt'])
    .where('userId', '=', userId)
    .where('status', 'in', ['queued', 'running'])
    .where('updatedAt', '>', cutoff)
    .orderBy('createdAt', 'desc')
    .executeTakeFirst()
}
