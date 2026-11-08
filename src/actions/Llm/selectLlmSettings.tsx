'use server'

import database from '@/modules/database'
import { envLlmConfig, modelReady } from '@/sorse/llm'
import { apiKeyHint } from '@/sorse/llmKey'
import { isMissingTable, storedApiKey, type StoredLlmSettings } from '@/sorse/llmSettings'
import type { LlmSettingsView } from '@/sorse/types'
import userId from '@/sorse/userId'

export default async function selectLlmSettings(): Promise<LlmSettingsView> {
  const id = await userId()
  if (!id) {
    throw new Error('Нужно войти')
  }

  let stored: StoredLlmSettings | null = null
  let tableReady = true
  try {
    const row = await database
      .selectFrom('llmSettings')
      .select(['baseUrl', 'model', 'apiKeyCiphertext'])
      .where('userId', '=', id)
      .executeTakeFirst()
    stored = row ?? null
  } catch (reason) {
    if (!isMissingTable(reason)) throw reason
    tableReady = false
  }

  const apiKey = storedApiKey(stored)
  const env = envLlmConfig()
  const userReady = stored ? modelReady({ baseUrl: stored.baseUrl, model: stored.model, apiKey }) : false

  return {
    baseUrl: stored?.baseUrl ?? null,
    model: stored?.model ?? null,
    hasKey: Boolean(stored?.apiKeyCiphertext),
    keyHint: apiKeyHint(apiKey),
    source: userReady ? 'user' : env ? 'env' : 'none',
    envModel: process.env.LLM_CHAT_MODEL?.trim() || 'gpt-4o-mini',
    tableReady,
  }
}
