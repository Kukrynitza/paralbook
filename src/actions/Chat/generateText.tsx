'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'
import { LEVELS, type Cefr } from '@/sorse/types'

interface GenerateInput {
  topic: string
  minutes: number
  level: Cefr
}

function pieces(sentence: string) {
  return sentence.split(/(\s+)/).filter((part) => part.length > 0)
}

function bare(part: string) {
  return part.replace(/^[^A-Za-zА-Яа-яЁё]+|[^A-Za-zА-Яа-яЁё]+$/g, '').toLowerCase()
}

export default async function generateText(input: GenerateInput) {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  const topic = input.topic.trim()
  if (!topic) {
    throw new Error('Напишите тему')
  }
  const level = LEVELS.includes(input.level) ? input.level : 'B1'
  const minutes = Math.min(60, Math.max(1, Math.round(input.minutes) || 5))
  const label = `${topic}, ${minutes} минут, уровень ${level}`
  const last = await database
    .selectFrom('chatMessages')
    .select('role')
    .where('userId', '=', id)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .executeTakeFirst()

  if (topic.toLowerCase() === 'error') {
    await database.transaction().execute(async (trx) => {
      if (last?.role !== 'error') {
        await trx.insertInto('chatMessages').values({ userId: id, role: 'user', body: label }).execute()
      }
      await trx
        .insertInto('chatMessages')
        .values({
          userId: id,
          role: 'error',
          body: 'Не получилось составить текст. Повторите ещё раз.',
          retryTopic: topic,
          retryMinutes: minutes,
          retryLevel: level,
        })
        .execute()
    })
    throw new Error('Не получилось составить текст. Повторите ещё раз.')
  }

  const title = topic.length > 42 ? `${topic.slice(0, 40)}…` : topic.charAt(0).toUpperCase() + topic.slice(1)
  const excerpt = `Короткий текст на тему «${topic}». Его можно прочитать примерно за ${minutes} мин. на уровне ${level}.`
  const english = `Hello. This short text is about ${topic}. It should take about ${minutes} minutes at level ${level}.`
  const ruParts = pieces(excerpt)
  const enParts = pieces(english)
  const words = [...new Set(enParts.map(bare).filter(Boolean))]
  const known = words.length
    ? await database.selectFrom('lemmas').select('lemma').where('lemma', 'in', words).execute()
    : []
  const lemmas = new Set(known.map((item) => item.lemma))

  await database.transaction().execute(async (trx) => {
    if (last?.role !== 'error') {
      await trx.insertInto('chatMessages').values({ userId: id, role: 'user', body: label }).execute()
    }
    const text = await trx
      .insertInto('texts')
      .values({
        ownerId: id,
        title,
        excerpt,
        minutes,
        level,
        topic,
        baseRating: 0,
        published: false,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    const page = await trx
      .insertInto('pages')
      .values({ textId: text.id, position: 0 })
      .returning('id')
      .executeTakeFirstOrThrow()
    await trx
      .insertInto('ruTokens')
      .values(ruParts.map((text, position) => ({ pageId: page.id, position, text })))
      .execute()
    let align = 0
    await trx
      .insertInto('enTokens')
      .values(
        enParts.map((text, position) => {
          if (/^\s+$/.test(text)) {
            return { pageId: page.id, position, text, lemma: null, align: null }
          }
          const word = bare(text)
          const token = {
            pageId: page.id,
            position,
            text,
            lemma: lemmas.has(word) ? word : null,
            align,
          }
          align += 1
          return token
        }),
      )
      .execute()
    await trx
      .insertInto('collectionItems')
      .values({ userId: id, textId: text.id, source: 'chat', progress: 0, credited: false })
      .execute()
    await trx.insertInto('chatMessages').values({ userId: id, role: 'result', textId: text.id }).execute()
  })
}
