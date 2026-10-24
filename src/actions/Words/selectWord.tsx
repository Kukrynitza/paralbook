'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'
import type { DictEntry } from '@/sorse/types'

export default async function selectWord(lemma: string): Promise<DictEntry> {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }
  const word = await database
    .selectFrom('lemmas')
    .select(['lemma', 'ipa', 'translation', 'gloss', 'rank', 'example', 'hint'])
    .where('lemma', '=', lemma.toLowerCase())
    .executeTakeFirst()
  if (!word) {
    throw new Error('Слова нет в словарной статье')
  }
  const senses = await database
    .selectFrom('senses')
    .select(['id', 'pos', 'text', 'position'])
    .where('lemma', '=', word.lemma)
    .orderBy('position', 'asc')
    .execute()
  const examples = senses.length
    ? await database
        .selectFrom('senseExamples')
        .select(['senseId', 'text', 'position'])
        .where('senseId', 'in', senses.map((item) => item.id))
        .orderBy('position', 'asc')
        .execute()
    : []
  return {
    lemma: word.lemma,
    ipa: word.ipa,
    translation: word.translation,
    gloss: word.gloss,
    rank: word.rank,
    example: word.example,
    hint: word.hint,
    senses: senses.length
      ? senses.map((sense) => ({
          pos: sense.pos,
          text: sense.text,
          examples: examples.filter((item) => item.senseId === sense.id).map((item) => item.text),
        }))
      : [{ pos: 'сл.', text: `— ${word.translation}`, examples: word.example ? [word.example] : [] }],
  }
}
