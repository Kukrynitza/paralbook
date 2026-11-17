import { randomUUID } from 'node:crypto'
import { sql } from 'kysely'
import database from '@/modules/database'
import deleteText from '@/actions/Reading/deleteText'
import { getTextServiceConfig, signServiceToken, textServicePublicUrl } from '@/sorse/textService'
import { LEVELS, type Cefr } from '@/sorse/types'

export interface StartImportInput {
  title: string
  topic: string
  level: Cefr
  source?: 'upload' | 'text'
}

const ACTIVE = ['uploading', 'queued', 'running']

export async function createImport(id: string, input: StartImportInput) {
  const limits = await getTextServiceConfig()
  const title = input.title.trim().slice(0, 80) || 'Своя книга'
  const topic = input.topic.trim().slice(0, 120) || title
  const level = LEVELS.includes(input.level) ? input.level : 'B1'
  const source = input.source === 'text' ? 'text' : 'upload'
  const jobId = randomUUID()
  const textId = await database.transaction().execute(async (trx) => {
    await sql`select pg_advisory_xact_lock(hashtextextended(${id}::text, 0))`.execute(trx)
    const cutoff = new Date(Date.now() - 30 * 60 * 1000)
    const active = await trx
      .selectFrom('textJobs')
      .select('id')
      .where('userId', '=', id)
      .where('status', 'in', ACTIVE)
      .where('updatedAt', '>', cutoff)
      .executeTakeFirst()
    if (active) {
      throw new Error('Дождитесь завершения текущей задачи')
    }
    const created = await trx
      .insertInto('texts')
      .values({
        ownerId: id,
        title,
        excerpt: title,
        minutes: 1,
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
      .values({ userId: id, textId: created.id, source: 'upload', progress: 0, credited: false })
      .execute()
    await trx
      .insertInto('textJobs')
      .values({
        id: jobId,
        userId: id,
        textId: created.id,
        type: 'import',
        status: 'uploading',
        stage: 'uploading',
        progress: 0,
        error: null,
        payload: { title, topic, level, source },
        result: null,
      })
      .execute()
    return created.id
  })
  try {
    const token = await signServiceToken({ userId: id, textId, jobId, scope: 'import' }, '2h')
    return {
      textId,
      jobId,
      token,
      serviceUrl: textServicePublicUrl(),
      limits,
    }
  } catch (reason) {
    await deleteText(textId).catch(() => undefined)
    throw reason
  }
}
