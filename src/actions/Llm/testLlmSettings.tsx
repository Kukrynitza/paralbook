'use server'

import { chatText, isLocalBaseUrl, llmErrorMessage, modelReady, normalizeBaseUrl } from '@/sorse/llm'
import { loadStoredLlmSettings, storedApiKey, type StoredLlmSettings } from '@/sorse/llmSettings'
import { validateLlmApiKey, validateLlmBaseUrl, validateLlmModel } from '@/sorse/llmValidation'
import type { LlmTestResult } from '@/sorse/types'
import userId from '@/sorse/userId'

interface TestLlmSettingsInput {
  baseUrl: string
  model: string
  apiKey?: string
}

const lastTest = new Map<string, number>()
const TEST_GAP_MS = 2000

export default async function testLlmSettings(input: TestLlmSettingsInput): Promise<LlmTestResult> {
  const id = await userId()
  if (!id) {
    return { ok: false, text: 'Нужно войти' }
  }

  const baseUrl = normalizeBaseUrl(input.baseUrl ?? '')
  const model = (input.model ?? '').trim()
  const apiKeyInput = (input.apiKey ?? '').trim()
  const invalid = validateLlmBaseUrl(baseUrl) ?? validateLlmModel(model) ?? validateLlmApiKey(apiKeyInput)
  if (invalid) {
    return { ok: false, text: invalid }
  }

  const now = Date.now()
  const previous = lastTest.get(id) ?? 0
  if (now - previous < TEST_GAP_MS) {
    return { ok: false, text: 'Подождите пару секунд перед следующей проверкой' }
  }
  lastTest.set(id, now)

  let stored: StoredLlmSettings | null = null
  try {
    stored = await loadStoredLlmSettings(id)
  } catch {
    return { ok: false, text: 'Не удалось прочитать сохранённые настройки' }
  }

  const apiKey = apiKeyInput || storedApiKey(stored)
  if (!apiKey && !isLocalBaseUrl(baseUrl)) {
    return { ok: false, text: 'Укажите API-ключ' }
  }
  if (!modelReady({ baseUrl, model, apiKey })) {
    return { ok: false, text: 'Заполните Base URL и название модели' }
  }

  const started = Date.now()
  try {
    await chatText('Ты проверяешь подключение к модели. Ответь одним словом OK.', 'ping', {
      baseUrl,
      model,
      apiKey,
    }, { maxTokens: 5, temperature: 0, timeoutMs: 20_000 })
    const latencyMs = Date.now() - started
    return { ok: true, text: `Подключение работает, ${latencyMs} мс`, latencyMs, model }
  } catch (reason) {
    return { ok: false, text: llmErrorMessage(reason) }
  }
}
