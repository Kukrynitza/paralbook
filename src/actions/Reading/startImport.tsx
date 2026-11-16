'use server'

import database from '@/modules/database'
import deleteText from '@/actions/Reading/deleteText'
import { activeJobFor } from '@/sorse/jobs'
import { getTextServiceConfig, signServiceToken, textServicePublicUrl } from '@/sorse/textService'
import { LEVELS, type Cefr } from '@/sorse/types'
import userId from '@/sorse/userId'

interface StartImportInput {
  title: string
  topic: string
  level: Cefr
}

export default async function startImport(input: StartImportInput) {
  const id = await userId()
  if (!id) throw new Error('Нужно войти')
  if (await activeJobFor(id)) {
    throw new Error('Дождитесь завершения текущей задачи')
  }
  const limits = await getTextServiceConfig()
  const title = input.title.trim().slice(0, 80) || 'Своя книга'
  const topic = input.topic.trim().slice(0, 120) || title
  const level = LEVELS.includes(input.level) ? input.level : 'B1'
  const textId = await database.transaction().execute(async (trx) => {
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
    return created.id
  })
  try {
    const token = await signServiceToken({ userId: id, textId, scope: 'import' }, '2h')
    return {
      textId,
      token,
      serviceUrl: textServicePublicUrl(),
      limits,
    }
  } catch (reason) {
    await deleteText(textId).catch(() => undefined)
    throw reason
  }
}
