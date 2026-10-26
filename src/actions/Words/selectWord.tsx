'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'
import type { DictEntry } from '@/sorse/types'

function formOf(word: string) {
  return word.trim().toLowerCase()
}

export default async function selectWord(word: string): Promise<DictEntry> {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  const form = formOf(word)
  const matches = await database
    .selectFrom('wordForms')
    .innerJoin('lemmas', 'lemmas.lemma', 'wordForms.lemma')
    .select(['wordForms.lemma', 'lemmas.rank'])
    .where('wordForms.formNorm', '=', form)
    .execute()
  const exact = matches.find((item) => item.lemma === form)
  const chosen = exact ?? matches.reduce<(typeof matches)[number] | null>((best, item) => {
    if (!best || item.rank < best.rank) return item
    return best
  }, null)
  if (!chosen) {
    throw new Error('Слова нет в словарной статье')
  }
  const entry = await database
    .selectFrom('lemmas')
    .select(['lemma', 'ipa', 'translation', 'rank', 'example', 'hint'])
    .where('lemma', '=', chosen.lemma)
    .executeTakeFirst()
  if (!entry) {
    throw new Error('Слова нет в словарной статье')
  }
  const senses = await database
    .selectFrom('senses')
    .select(['id', 'pos', 'text', 'position'])
    .where('lemma', '=', entry.lemma)
    .orderBy('position', 'asc')
    .execute()
  const examples = senses.length
    ? await database
        .selectFrom('senseExamples')
        .select(['senseId', 'textEn', 'textRu', 'position'])
        .where('senseId', 'in', senses.map((item) => item.id))
        .orderBy('position', 'asc')
        .execute()
    : []
  return {
    lemma: entry.lemma,
    ipa: entry.ipa,
    translation: entry.translation,
    rank: entry.rank,
    example: entry.example,
    hint: entry.hint,
    senses: senses.length
      ? senses.map((sense) => ({
          pos: sense.pos,
          text: sense.text,
          examples: examples
            .filter((item) => item.senseId === sense.id)
            .map((item) => ({ textEn: item.textEn, textRu: item.textRu })),
        }))
      : entry.translation
        ? [{ pos: 'сл.', text: entry.translation, examples: entry.example ? [{ textEn: entry.example, textRu: null }] : [] }]
        : [],
  }
}
