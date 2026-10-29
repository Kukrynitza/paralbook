'use server'

import database from '@/modules/database'
import { persistText, wordCount } from '@/sorse/textBook'
import { LEVELS, type Cefr } from '@/sorse/types'
import userId from '@/sorse/userId'

interface UploadInput {
  title: string
  topic: string
  level: Cefr
  body: string
}

export default async function uploadText(input: UploadInput) {
  const id = await userId()
  if (!id) throw new Error('Нужно войти')
  const body = input.body.replace(/\uFFFD/g, '').trim()
  if (body.length < 20) throw new Error('Текст слишком короткий')
  if (body.length > 2_000_000) throw new Error('Текст слишком длинный')
  const title = input.title.trim().slice(0, 80) || 'Свой текст'
  const topic = input.topic.trim().slice(0, 120) || title
  const level = LEVELS.includes(input.level) ? input.level : 'B1'
  const minutes = Math.max(1, Math.round(wordCount(body) / 120))
  return database.transaction().execute((trx) =>
    persistText(trx, {
      userId: id,
      title,
      excerpt: body,
      minutes,
      level,
      topic,
      english: body,
      russian: 'Загруженный текст',
      source: 'upload',
    }),
  )
}
