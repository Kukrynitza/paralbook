import database from '@/modules/database'
import { envLlmConfig, modelReady, type LlmConfig } from './llm'
import { decryptApiKey } from './llmKey'

export interface StoredLlmSettings {
  baseUrl: string
  model: string
  apiKeyCiphertext: string | null
}

export function isMissingTable(reason: unknown) {
  return typeof reason === 'object' && reason !== null && (reason as { code?: string }).code === '42P01'
}

export async function loadStoredLlmSettings(userIdValue: string): Promise<StoredLlmSettings | null> {
  try {
    const row = await database
      .selectFrom('llmSettings')
      .select(['baseUrl', 'model', 'apiKeyCiphertext'])
      .where('userId', '=', userIdValue)
      .executeTakeFirst()
    return row ?? null
  } catch (reason) {
    if (isMissingTable(reason)) return null
    throw reason
  }
}

export function storedApiKey(row: StoredLlmSettings | null | undefined) {
  if (!row?.apiKeyCiphertext) return null
  try {
    return decryptApiKey(row.apiKeyCiphertext)
  } catch {
    return null
  }
}

export async function resolveLlmConfig(userIdValue: string): Promise<{
  config: LlmConfig | null
  source: 'user' | 'env' | 'none'
}> {
  const stored = await loadStoredLlmSettings(userIdValue)
  if (stored) {
    const config: LlmConfig = {
      baseUrl: stored.baseUrl,
      model: stored.model,
      apiKey: storedApiKey(stored),
    }
    if (modelReady(config)) {
      return { config, source: 'user' }
    }
  }
  const env = envLlmConfig()
  if (env) {
    return { config: env, source: 'env' }
  }
  return { config: null, source: 'none' }
}
