'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'
import type { Cefr, ChatMessage, ChatText } from '@/sorse/types'

export default async function selectChat(): Promise<{ messages: ChatMessage[] }> {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  const rows = await database
    .selectFrom('chatMessages')
    .select(['id', 'role', 'body', 'textId', 'retryTopic', 'retryMinutes', 'retryLevel'])
    .where('userId', '=', id)
    .orderBy('createdAt', 'asc')
    .execute()
  const textIds = rows.flatMap((item) => (item.textId ? [item.textId] : []))
  const texts = textIds.length
    ? await database
        .selectFrom('texts')
        .select(['id', 'title', 'excerpt', 'minutes', 'level', 'published'])
        .where('id', 'in', textIds)
        .execute()
    : []
  const byId = new Map(texts.map((item) => [item.id, item]))
  const messages = rows.map((row) => {
    if (row.role === 'result') {
      const text = row.textId ? byId.get(row.textId) : undefined
      const card: ChatText | null = text
        ? {
            id: text.id,
            title: text.title,
            excerpt: text.excerpt,
            minutes: text.minutes,
            level: text.level,
            published: text.published,
          }
        : null
      return { id: row.id, role: 'result' as const, text: card }
    }
    if (row.role === 'error') {
      return {
        id: row.id,
        role: 'error' as const,
        text: row.body ?? 'Не получилось составить текст. Повторите ещё раз.',
        retry: {
          topic: row.retryTopic ?? '',
          minutes: row.retryMinutes ?? 5,
          level: (row.retryLevel ?? 'B1') as Cefr,
        },
      }
    }
    return { id: row.id, role: row.role, text: row.body ?? '' }
  })
  return { messages }
}
