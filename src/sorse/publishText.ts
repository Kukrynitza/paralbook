import database from '@/modules/database'
import { moderateText } from '@/sorse/moderation'
import { checkTextLanguage, type LanguageCheck } from '@/sorse/textService'

function languageSample(text: string, size = 1500, chunks = 7) {
  if (text.length <= size * chunks) return text
  const last = text.length - size
  return Array.from({ length: chunks }, (_, index) => {
    const start = Math.round((index * last) / (chunks - 1))
    return text.slice(start, start + size)
  }).join('\n')
}

async function publishEntry(userId: string, entryId: string) {
  const entry = await database
    .selectFrom('collectionItems')
    .innerJoin('texts', 'texts.id', 'collectionItems.textId')
    .select([
      'collectionItems.textId',
      'texts.ownerId',
      'texts.title',
      'texts.topic',
      'texts.excerpt',
      'texts.ready',
      'texts.published',
    ])
    .where('collectionItems.id', '=', entryId)
    .where('collectionItems.userId', '=', userId)
    .executeTakeFirst()
  if (!entry) {
    throw new Error('В подборке нет такого текста')
  }
  if (entry.ownerId !== userId) {
    throw new Error('В библиотеку можно публиковать только свои тексты')
  }
  if (entry.published) {
    throw new Error('Этот текст уже опубликован')
  }
  if (!entry.ready) {
    throw new Error('Текст ещё не готов к публикации')
  }

  const [tokens, russianTokens] = await Promise.all([
    database
      .selectFrom('enTokens')
      .innerJoin('pages', 'pages.id', 'enTokens.pageId')
      .select('enTokens.text')
      .where('pages.textId', '=', entry.textId)
      .execute(),
    database
      .selectFrom('ruTokens')
      .innerJoin('pages', 'pages.id', 'ruTokens.pageId')
      .select('ruTokens.text')
      .where('pages.textId', '=', entry.textId)
      .execute(),
  ])
  const body = tokens.map((item) => item.text).join(' ').trim() || (entry.excerpt || '').trim()
  if (body.length < 20) {
    throw new Error('В тексте слишком мало содержимого для публикации')
  }
  const russianBody = russianTokens.map((item) => item.text).join(' ').trim()
  const moderation = moderateText([entry.title, entry.topic, body, russianBody].filter(Boolean).join('\n'))
  if (!moderation.allowed) {
    throw new Error(moderation.reason || 'Текст не прошёл проверку')
  }

  const sample = languageSample(body)
  let language: LanguageCheck
  try {
    language = await checkTextLanguage(sample)
  } catch {
    throw new Error('Не удалось проверить язык текста. Попробуйте позже.')
  }
  if (language.code !== 'en') {
    throw new Error(
      `В библиотеку можно публиковать только английские тексты. Определён ${language.name} (${language.code}).`,
    )
  }

  if (russianBody.length >= 80) {
    let russianLanguage: LanguageCheck
    try {
      russianLanguage = await checkTextLanguage(languageSample(russianBody))
    } catch {
      throw new Error('Не удалось проверить язык русского перевода. Попробуйте позже.')
    }
    if (russianLanguage.code !== 'ru') {
      throw new Error(
        `Русская часть текста должна быть на русском. Определён ${russianLanguage.name} (${russianLanguage.code}).`,
      )
    }
  }

  await database.transaction().execute(async (trx) => {
    const published = await trx
      .updateTable('texts')
      .set({ published: true })
      .where('id', '=', entry.textId)
      .where('published', '=', false)
      .returning('id')
      .executeTakeFirst()
    if (!published) {
      throw new Error('Этот текст уже опубликован')
    }
    const moved = await trx
      .updateTable('collectionItems')
      .set({ source: 'library' })
      .where('id', '=', entryId)
      .where('userId', '=', userId)
      .returning('id')
      .executeTakeFirst()
    if (!moved) {
      throw new Error('В подборке нет такого текста')
    }
  })
}

export async function publishCollectionEntry(userId: string, entryId: string) {
  return publishEntry(userId, entryId)
}

export async function publishTextEntry(userId: string, textId: string) {
  const entry = await database
    .selectFrom('collectionItems')
    .select('id')
    .where('userId', '=', userId)
    .where('textId', '=', textId)
    .executeTakeFirst()
  if (!entry) {
    throw new Error('В подборке нет такого текста')
  }
  return publishEntry(userId, entry.id)
}
