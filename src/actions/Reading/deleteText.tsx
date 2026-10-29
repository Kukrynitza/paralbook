'use server'

import { sql } from 'kysely'
import database from '@/modules/database'
import userId from '@/sorse/userId'

export default async function deleteText(textId: string) {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  const text = await database.selectFrom('texts').select(['id', 'ownerId']).where('id', '=', textId).executeTakeFirst()
  if (!text) {
    throw new Error('Текст не найден')
  }
  if (text.ownerId !== id) {
    throw new Error('Чужой текст удалить нельзя')
  }
  await database.transaction().execute(async (trx) => {
    const pages = await trx.selectFrom('pages').select('id').where('textId', '=', textId).execute()
    const pageIds = pages.map((item) => item.id)
    if (pageIds.length) {
      await trx.deleteFrom('enTokens').where('pageId', 'in', pageIds).execute()
      await trx.deleteFrom('ruTokens').where('pageId', 'in', pageIds).execute()
      await trx.deleteFrom('pages').where('textId', '=', textId).execute()
    }
    await trx.deleteFrom('votes').where('textId', '=', textId).execute()
    await trx.deleteFrom('collectionItems').where('textId', '=', textId).execute()
    await sql`
      delete from chat_messages
      where id = (
        select prompt.id
        from chat_messages result
        join lateral (
          select id
          from chat_messages
          where user_id = result.user_id
            and role = 'user'
            and text_id is null
            and created_at <= result.created_at
          order by created_at desc
          limit 1
        ) prompt on true
        where result.text_id = ${textId}
          and result.user_id = ${id}
        order by result.created_at desc
        limit 1
      )
    `.execute(trx)
    await trx.deleteFrom('chatMessages').where('textId', '=', textId).execute()
    const chunks = await sql<{ name: string | null }>`select to_regclass('public.text_chunks') as name`.execute(trx)
    if (chunks.rows[0]?.name) {
      await trx.deleteFrom('textChunks').where('textId', '=', textId).execute()
    }
    await trx.deleteFrom('texts').where('id', '=', textId).execute()
  })
}
