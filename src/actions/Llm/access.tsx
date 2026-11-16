'use server'

import { signServiceToken, textServicePublicUrl } from '@/sorse/textService'
import userId from '@/sorse/userId'

export default async function llmAccess() {
  const id = await userId()
  if (!id) throw new Error('Нужно войти')
  return {
    url: textServicePublicUrl(),
    token: await signServiceToken({ userId: id, scope: 'llm' }, '10m'),
  }
}
