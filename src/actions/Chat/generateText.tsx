'use server'

import database from '@/modules/database'
import { chatText, modelReady, readObject } from '@/sorse/llm'
import { preview } from '@/sorse/preview'
import { persistText, rewritePages, wordCount } from '@/sorse/textBook'
import { LEVELS, type Cefr } from '@/sorse/types'
import userId from '@/sorse/userId'

interface GenerateInput {
  topic: string
  minutes: number
  level: Cefr
}

function interestNote(interests: string[]) {
  const names = interests.map((item) => item.trim()).filter(Boolean)
  if (!names.length) return ''
  return ` Интересы читателя: ${names.join(', ')}. Вплетай их в примеры. Явно заданную тему не подменяй.`
}

function repeats(previous: string, piece: string) {
  if (!previous || !piece) return false
  const sample = piece.replace(/\s+/g, ' ').trim().slice(0, 80).toLowerCase()
  return Boolean(sample) && previous.replace(/\s+/g, ' ').toLowerCase().includes(sample)
}

async function nextPiece(topic: string, level: Cefr, need: number, english: string, strict: boolean, interests: string[]) {
  const note = interestNote(interests)
  const system = english
    ? `${strict ? 'Предыдущий ответ повторил уже написанное. Напиши только следующие предложения того же текста, которых ещё нет.' : 'Продолжи тот же учебный текст следующим абзацем. Не повторяй уже написанное и не начинай новую историю.'} Верни только JSON {"english","russian"} — только новый кусок, около addWords слов, уровень CEFR не выше заданного.${note}`
    : `Ты пишешь один связный учебный английский текст. Верни только JSON {"title","english","russian"}. russian — перевод этой части. Около words слов, уровень CEFR не выше заданного. Каждое предложение закончено. Это начало текста.${note}`
  const payload = english
    ? { level, addWords: need, english: english.slice(-900) }
    : { topic, words: need, level }
  const raw = await chatText(system, JSON.stringify(payload))
  const parsed = readObject(raw)
  if (!parsed) return { english: '', russian: '', title: '' }
  return {
    english: String(parsed.english || '').trim(),
    russian: String(parsed.russian || '').trim(),
    title: String(parsed.title || '').trim(),
  }
}

async function fail(userIdValue: string, topic: string, minutes: number, level: Cefr, lastRole: string | undefined, body: string) {
  await database.transaction().execute(async (trx) => {
    if (lastRole !== 'error') {
      await trx.insertInto('chatMessages').values({ userId: userIdValue, role: 'user', body: `${topic}, ${minutes} минут, уровень ${level}` }).execute()
    }
    await trx
      .insertInto('chatMessages')
      .values({ userId: userIdValue, role: 'error', body, retryTopic: topic, retryMinutes: minutes, retryLevel: level })
      .execute()
  })
  throw new Error(body)
}

export default async function generateText(input: GenerateInput) {
  const id = await userId()
  if (!id) throw new Error('Нужно войти')
  const topic = input.topic.trim()
  if (!topic) throw new Error('Напишите тему')
  const level = LEVELS.includes(input.level) ? input.level : 'B1'
  const minutes = Math.min(60, Math.max(1, Math.round(input.minutes) || 5))
  const profile = await database.selectFrom('profiles').select('interests').where('id', '=', id).executeTakeFirst()
  const last = await database
    .selectFrom('chatMessages')
    .select('role')
    .where('userId', '=', id)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .executeTakeFirst()
  if (!modelReady()) {
    await fail(id, topic, minutes, level, last?.role, 'Модель не настроена. Повторите, когда она будет доступна.')
  }
  const target = minutes * 90
  let english = ''
  let russian = ''
  let title = topic.length > 42 ? `${topic.slice(0, 40)}…` : topic.charAt(0).toUpperCase() + topic.slice(1)
  let textId: string | null = null
  try {
    for (let step = 0; step < 20; step += 1) {
      const have = wordCount(english)
      if (have >= Math.floor(target * 0.85)) break
      const need = Math.min(350, Math.max(40, target - have))
      let piece = await nextPiece(topic, level, need, english, false, profile?.interests ?? [])
      if (piece.english && repeats(english, piece.english)) {
        const retry = await nextPiece(topic, level, need, english, true, profile?.interests ?? [])
        piece = {
          english: retry.english || piece.english,
          russian: retry.russian || piece.russian,
          title: retry.title || piece.title,
        }
      }
      if (!piece.english) break
      const before = have
      english = english ? `${english}\n\n${piece.english}` : piece.english
      if (piece.title && before === 0) title = piece.title.slice(0, 80)
      if (piece.russian) russian = russian ? `${russian}\n\n${piece.russian}` : piece.russian
      const shown = Math.max(1, Math.round(wordCount(english) / 90))
      const lead = preview(english)
      if (!textId) {
        textId = await database.transaction().execute(async (trx) => {
          if (last?.role !== 'error') {
            await trx
              .insertInto('chatMessages')
              .values({ userId: id, role: 'user', body: `${topic}, ${minutes} минут, уровень ${level}` })
              .execute()
          }
          const created = await persistText(trx, {
            userId: id,
            title,
            excerpt: lead,
            minutes: shown,
            level,
            topic,
            english,
            russian: russian || lead,
            source: 'chat',
          })
          await trx.insertInto('chatMessages').values({ userId: id, role: 'result', textId: created }).execute()
          return created
        })
      } else {
        const currentId = textId
        await database.transaction().execute(async (trx) => {
          await trx
            .updateTable('texts')
            .set({ title: title.slice(0, 80), excerpt: lead.slice(0, 500), minutes: shown })
            .where('id', '=', currentId)
            .execute()
          await rewritePages(trx, currentId, english, russian || lead)
        })
      }
      if (wordCount(english) <= before + 20) break
    }
  } catch {
    if (!textId) {
      await fail(id, topic, minutes, level, last?.role, 'Модель не ответила. Повторите ещё раз.')
    }
  }
  if (!textId) {
    await fail(id, topic, minutes, level, last?.role, 'Модель не ответила. Повторите ещё раз.')
  }
}
