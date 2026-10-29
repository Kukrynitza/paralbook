import type { Kysely, Transaction } from 'kysely'
import type { Database } from '@/modules/database'
import type { Cefr } from '@/sorse/types'
import { preview } from '@/sorse/preview'

type Db = Kysely<Database> | Transaction<Database>

export function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function pieces(sentence: string) {
  return sentence.split(/(\s+)/).filter((part) => part.length > 0)
}

function bare(part: string) {
  return part.replace(/^[^A-Za-zА-Яа-яЁё]+|[^A-Za-zА-Яа-яЁё]+$/g, '').toLowerCase()
}

function pageTexts(english: string) {
  const blocks = english
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter(Boolean)
  const pieces: string[] = []
  for (const block of blocks.length ? blocks : [english]) {
    const words = block.split(/\s+/).filter(Boolean)
    if (words.length <= 450) {
      pieces.push(block)
      continue
    }
    for (let index = 0; index < words.length; index += 400) pieces.push(words.slice(index, index + 400).join(' '))
  }
  const pages: string[] = []
  let current: string[] = []
  let count = 0
  for (const block of pieces) {
    const words = wordCount(block)
    if (current.length && count + words > 450) {
      pages.push(current.join('\n\n'))
      current = [block]
      count = words
    } else {
      current.push(block)
      count += words
    }
  }
  if (current.length) pages.push(current.join('\n\n'))
  return pages.length ? pages : [english]
}

async function lemmaOf(db: Db, forms: string[]) {
  const exact = new Set<string>()
  const best = new Map<string, { lemma: string; rank: number }>()
  for (let index = 0; index < forms.length; index += 500) {
    const chunk = forms.slice(index, index + 500)
    const lemmas = await db.selectFrom('lemmas').select('lemma').where('lemma', 'in', chunk).execute()
    for (const row of lemmas) exact.add(row.lemma)
    const formsRows = await db
      .selectFrom('wordForms')
      .innerJoin('lemmas', 'lemmas.lemma', 'wordForms.lemma')
      .select(['wordForms.formNorm', 'wordForms.lemma', 'lemmas.rank'])
      .where('wordForms.formNorm', 'in', chunk)
      .execute()
    for (const row of formsRows) {
      const current = best.get(row.formNorm)
      if (!current || row.rank < current.rank) best.set(row.formNorm, { lemma: row.lemma, rank: row.rank })
    }
  }
  const map = new Map<string, string>()
  for (const form of forms) {
    if (exact.has(form)) map.set(form, form)
    else if (best.has(form)) map.set(form, best.get(form)!.lemma)
  }
  return map
}

export async function writePages(db: Db, textId: string, english: string, russian: string) {
  const pages = pageTexts(english)
  for (const [position, pageText] of pages.entries()) {
    const page = await db.insertInto('pages').values({ textId, position }).returning('id').executeTakeFirstOrThrow()
    const ruParts = pieces(position === 0 && russian.trim() ? russian : ' ')
    const enParts = pieces(pageText)
    if (ruParts.length) {
      await db
        .insertInto('ruTokens')
        .values(ruParts.map((text, index) => ({ pageId: page.id, position: index, text })))
        .execute()
    }
    const forms = [...new Set(enParts.map(bare).filter(Boolean))]
    const known = await lemmaOf(db, forms)
    let align = 0
    if (enParts.length) {
      await db
        .insertInto('enTokens')
        .values(
          enParts.map((text, index) => {
            if (/^\s+$/.test(text)) return { pageId: page.id, position: index, text, lemma: null, align: null }
            const word = bare(text)
            const token = {
              pageId: page.id,
              position: index,
              text,
              lemma: known.get(word) ?? null,
              align: align < ruParts.length ? align : null,
            }
            align += 1
            return token
          }),
        )
        .execute()
    }
  }
}

export async function rewritePages(db: Db, textId: string, english: string, russian: string) {
  const rows = await db.selectFrom('pages').select('id').where('textId', '=', textId).execute()
  const ids = rows.map((row) => row.id)
  if (ids.length) {
    await db.deleteFrom('enTokens').where('pageId', 'in', ids).execute()
    await db.deleteFrom('ruTokens').where('pageId', 'in', ids).execute()
    await db.deleteFrom('pages').where('textId', '=', textId).execute()
  }
  await writePages(db, textId, english, russian)
}

export async function persistText(
  db: Db,
  input: {
    userId: string
    title: string
    excerpt: string
    minutes: number
    level: Cefr
    topic: string
    english: string
    russian: string
    source: 'chat' | 'upload'
  },
) {
  const text = await db
    .insertInto('texts')
    .values({
      ownerId: input.userId,
      title: input.title.slice(0, 80),
      excerpt: preview(input.excerpt).slice(0, 500),
      minutes: input.minutes,
      level: input.level,
      topic: input.topic.slice(0, 120),
      baseRating: 0,
      published: false,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  await writePages(db, text.id, input.english, input.russian)
  await db
    .insertInto('collectionItems')
    .values({ userId: input.userId, textId: text.id, source: input.source, progress: 0, credited: false })
    .execute()
  return text.id
}
