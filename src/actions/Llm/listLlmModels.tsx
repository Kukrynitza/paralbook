'use server'

import { isLocalBaseUrl, listModels, llmErrorMessage, normalizeBaseUrl } from '@/sorse/llm'
import { loadStoredLlmSettings, storedApiKey, type StoredLlmSettings } from '@/sorse/llmSettings'
import { validateLlmApiKey, validateLlmBaseUrl } from '@/sorse/llmValidation'
import type { LlmModelsResult } from '@/sorse/types'
import userId from '@/sorse/userId'

interface ListLlmModelsInput {
  baseUrl: string
  apiKey?: string
}

export default async function listLlmModels(input: ListLlmModelsInput): Promise<LlmModelsResult> {
  const id = await userId()
  if (!id) {
    return { ok: false, text: 'Нужно войти', models: [] }
  }

  const baseUrl = normalizeBaseUrl(input.baseUrl ?? '')
  const apiKeyInput = (input.apiKey ?? '').trim()
  const invalid = validateLlmBaseUrl(baseUrl) ?? validateLlmApiKey(apiKeyInput)
  if (invalid) {
    return { ok: false, text: invalid, models: [] }
  }

  let stored: StoredLlmSettings | null = null
  try {
    stored = await loadStoredLlmSettings(id)
  } catch {
    return { ok: false, text: 'Не удалось прочитать сохранённые настройки', models: [] }
  }

  const apiKey = apiKeyInput || storedApiKey(stored)
  if (!apiKey && !isLocalBaseUrl(baseUrl)) {
    return { ok: false, text: 'Укажите API-ключ', models: [] }
  }

  try {
    const models = await listModels({ baseUrl, model: 'unknown', apiKey })
    return {
      ok: true,
      models,
      text: models.length ? `Найдено моделей: ${models.length}` : 'Провайдер не вернул список моделей',
    }
  } catch (reason) {
    return { ok: false, text: llmErrorMessage(reason), models: [] }
  }
}
