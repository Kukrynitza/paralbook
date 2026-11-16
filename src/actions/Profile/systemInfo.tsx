'use server'

import pkg from '../../../package.json'
import database from '@/modules/database'
import { getTextServiceConfig, textServiceHealth, textServicePublicUrl } from '@/sorse/textService'
import type { SystemInfo } from '@/sorse/types'
import userId from '@/sorse/userId'

function numeric(value: string | number | bigint | null | undefined) {
  return Number(value ?? 0)
}

export default async function systemInfo(): Promise<SystemInfo> {
  const id = await userId()
  if (!id) throw new Error('Нужно войти')
  const [texts, words, mastered, read, lemmas, health, limits] = await Promise.all([
    database
      .selectFrom('collectionItems')
      .select((expression) => expression.fn.countAll<string>().as('total'))
      .where('userId', '=', id)
      .executeTakeFirstOrThrow(),
    database
      .selectFrom('userWords')
      .select((expression) => expression.fn.countAll<string>().as('total'))
      .where('userId', '=', id)
      .executeTakeFirstOrThrow(),
    database
      .selectFrom('userWords')
      .select((expression) => expression.fn.countAll<string>().as('total'))
      .where('userId', '=', id)
      .where('mastered', '=', true)
      .executeTakeFirstOrThrow(),
    database
      .selectFrom('collectionItems')
      .select((expression) => expression.fn.countAll<string>().as('total'))
      .where('userId', '=', id)
      .where('progress', '>=', 0.99)
      .executeTakeFirstOrThrow(),
    database
      .selectFrom('lemmas')
      .select((expression) => expression.fn.countAll<string>().as('total'))
      .executeTakeFirstOrThrow(),
    textServiceHealth(),
    getTextServiceConfig().catch(() => null),
  ])
  return {
    app: {
      version: pkg.version,
      next: String(pkg.dependencies.next ?? '').replace(/^[^\d]*/, ''),
      node: process.version,
      env: process.env.NODE_ENV ?? 'development',
    },
    service: {
      url: textServicePublicUrl(),
      ...health,
    },
    limits,
    data: {
      texts: numeric(texts.total),
      words: numeric(words.total),
      mastered: numeric(mastered.total),
      read: numeric(read.total),
      lemmas: numeric(lemmas.total),
    },
  }
}
