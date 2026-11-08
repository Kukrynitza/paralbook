export interface LlmConfig {
  baseUrl: string
  model: string
  apiKey: string | null
}

export interface ChatOptions {
  timeoutMs?: number
  maxTokens?: number
  temperature?: number
}

export type LlmErrorCode =
  | 'no_key'
  | 'unauthorized'
  | 'not_found'
  | 'rate_limit'
  | 'timeout'
  | 'network'
  | 'bad_request'
  | 'empty'

export class LlmError extends Error {
  code: LlmErrorCode
  userMessage: string
  status?: number

  constructor(code: LlmErrorCode, userMessage: string, status?: number) {
    super(userMessage)
    this.name = 'LlmError'
    this.code = code
    this.userMessage = userMessage
    this.status = status
  }
}

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_MODEL = 'gpt-4o-mini'
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0', 'host.docker.internal']

export function normalizeBaseUrl(raw: string) {
  let value = raw.trim()
  while (value.endsWith('/')) {
    value = value.slice(0, -1)
  }
  return value
}

export function chatEndpoint(baseUrl: string) {
  const base = normalizeBaseUrl(baseUrl)
  return /\/chat\/completions$/i.test(base) ? base : `${base}/chat/completions`
}

export function modelsEndpoint(baseUrl: string) {
  const base = normalizeBaseUrl(baseUrl).replace(/\/chat\/completions$/i, '')
  return `${base}/models`
}

export function isLocalBaseUrl(baseUrl: string) {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase()
    return LOCAL_HOSTS.includes(host) || host.endsWith('.local')
  } catch {
    return false
  }
}

export function envLlmConfig(): LlmConfig | null {
  const apiKey = process.env.LLM_API_KEY?.trim() || null
  const baseUrl = (process.env.LLM_BASE_URL || DEFAULT_BASE_URL).trim()
  const model = (process.env.LLM_CHAT_MODEL || DEFAULT_MODEL).trim()
  if (!apiKey || !baseUrl || !model) return null
  return { baseUrl, model, apiKey }
}

export function modelReady(config?: LlmConfig | null) {
  if (!config) return false
  if (!config.baseUrl.trim() || !config.model.trim()) return false
  return Boolean(config.apiKey?.trim()) || isLocalBaseUrl(config.baseUrl)
}

export function llmErrorMessage(reason: unknown) {
  if (reason instanceof LlmError) return reason.userMessage
  return 'Модель не ответила. Повторите ещё раз.'
}

function responseError(status: number, detail: string) {
  const clean = detail.replace(/\s+/g, ' ').trim().slice(0, 300)
  if (status === 401 || status === 403) {
    return new LlmError('unauthorized', 'Неверный API-ключ или нет доступа', status)
  }
  if (status === 404) {
    return new LlmError('not_found', 'Модель или адрес не найдены. Проверьте Base URL и название модели.', status)
  }
  if (status === 429) {
    return new LlmError('rate_limit', 'Превышен лимит запросов. Попробуйте позже.', status)
  }
  if (status >= 500) {
    return new LlmError('network', 'Сервер модели вернул ошибку. Попробуйте позже.', status)
  }
  if (status === 400 || status === 422) {
    return new LlmError('bad_request', clean ? `Провайдер отклонил запрос: ${clean}` : 'Провайдер отклонил запрос', status)
  }
  return new LlmError('bad_request', clean || `Модель ответила ошибкой ${status}`, status)
}

function authHeaders(config: LlmConfig) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  const key = config.apiKey?.trim()
  if (key) {
    headers.Authorization = `Bearer ${key}`
  }
  return headers
}

async function request(url: string, init: RequestInit, timeoutMs: number) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  } catch (reason) {
    if (reason instanceof Error && (reason.name === 'TimeoutError' || reason.name === 'AbortError')) {
      throw new LlmError('timeout', 'Сервер модели не ответил вовремя')
    }
    throw new LlmError('network', 'Не удалось подключиться к серверу модели')
  }
}

export async function chatText(system: string, user: string, config?: LlmConfig | null, options: ChatOptions = {}) {
  const settings = config ?? envLlmConfig()
  if (!settings) {
    throw new LlmError('no_key', 'Модель не настроена. Укажите API-ключ в настройках.')
  }
  if (!settings.baseUrl.trim() || !settings.model.trim()) {
    throw new LlmError('no_key', 'Модель не настроена. Укажите адрес и название модели.')
  }
  if (!settings.apiKey?.trim() && !isLocalBaseUrl(settings.baseUrl)) {
    throw new LlmError('unauthorized', 'Не указан API-ключ модели.')
  }
  const body: Record<string, unknown> = {
    model: settings.model.trim(),
    temperature: options.temperature ?? 0.7,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  }
  if (options.maxTokens) {
    body.max_tokens = options.maxTokens
  }
  const response = await request(
    chatEndpoint(settings.baseUrl),
    {
      method: 'POST',
      headers: authHeaders(settings),
      body: JSON.stringify(body),
    },
    options.timeoutMs ?? 60_000,
  )
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw responseError(response.status, detail)
  }
  let data: { choices?: { message?: { content?: string } }[] }
  try {
    data = (await response.json()) as typeof data
  } catch {
    throw new LlmError('empty', 'Модель вернула некорректный ответ')
  }
  const text = data.choices?.[0]?.message?.content
  if (typeof text !== 'string' || !text.trim()) {
    throw new LlmError('empty', 'Модель не вернула текст. Попробуйте другую модель.')
  }
  return text
}

export async function listModels(config: LlmConfig, timeoutMs = 15_000) {
  if (!config.baseUrl.trim()) {
    throw new LlmError('no_key', 'Укажите Base URL')
  }
  if (!config.apiKey?.trim() && !isLocalBaseUrl(config.baseUrl)) {
    throw new LlmError('unauthorized', 'Не указан API-ключ модели.')
  }
  const response = await request(
    modelsEndpoint(config.baseUrl),
    { method: 'GET', headers: authHeaders(config) },
    timeoutMs,
  )
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw responseError(response.status, detail)
  }
  let data: { data?: { id?: unknown }[]; models?: { id?: unknown; name?: unknown }[] }
  try {
    data = (await response.json()) as typeof data
  } catch {
    throw new LlmError('empty', 'Не удалось прочитать список моделей')
  }
  const items = data.data ?? data.models ?? []
  return items
    .map((item) => (typeof item.id === 'string' ? item.id : typeof (item as { name?: unknown }).name === 'string' ? String((item as { name?: unknown }).name) : ''))
    .filter((item): item is string => Boolean(item))
}

export function readObject(raw: string) {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const value = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
    return value && typeof value === 'object' ? value : null
  } catch {
    return null
  }
}
