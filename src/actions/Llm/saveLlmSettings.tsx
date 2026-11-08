'use server'

import database from '@/modules/database'
import { isLocalBaseUrl, normalizeBaseUrl } from '@/sorse/llm'
import { encryptApiKey } from '@/sorse/llmKey'
import { isMissingTable, type StoredLlmSettings } from '@/sorse/llmSettings'
import { validateLlmApiKey, validateLlmBaseUrl, validateLlmModel } from '@/sorse/llmValidation'
import userId from '@/sorse/userId'

interface SaveLlmSettingsInput {
  baseUrl: string
  model: string
  apiKey?: string
}

export default async function saveLlmSettings(input: SaveLlmSettingsInput) {
  const id = await userId()
  if (!id) {
    return 'Нужно войти'
  }

  const baseUrl = normalizeBaseUrl(input.baseUrl ?? '')
  const model = (input.model ?? '').trim()
  const apiKey = (input.apiKey ?? '').trim()
  const invalid = validateLlmBaseUrl(baseUrl) ?? validateLlmModel(model) ?? validateLlmApiKey(apiKey)
  if (invalid) {
    return invalid
  }

  let existing: StoredLlmSettings | null = null
  try {
    const row = await database
      .selectFrom('llmSettings')
      .select(['baseUrl', 'model', 'apiKeyCiphertext'])
      .where('userId', '=', id)
      .executeTakeFirst()
    existing = row ?? null
  } catch (reason) {
    if (isMissingTable(reason)) {
      return 'Таблица llm_settings ещё не создана в Supabase'
    }
    throw reason
  }

  if (!apiKey && !existing?.apiKeyCiphertext && !isLocalBaseUrl(baseUrl)) {
    return 'Укажите API-ключ'
  }

  let ciphertext = existing?.apiKeyCiphertext ?? null
  if (apiKey) {
    try {
      ciphertext = encryptApiKey(apiKey)
    } catch {
      return 'Не задан секрет для шифрования ключа. Добавьте LLM_SETTINGS_SECRET в .env'
    }
  }

  const updatedAt = new Date()
  await database
    .insertInto('llmSettings')
    .values({ userId: id, baseUrl, model, apiKeyCiphertext: ciphertext, updatedAt })
    .onConflict((oc) =>
      oc.column('userId').doUpdateSet({ baseUrl, model, apiKeyCiphertext: ciphertext, updatedAt }),
    )
    .execute()
}
