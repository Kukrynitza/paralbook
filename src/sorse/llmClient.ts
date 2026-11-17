import llmAccess from '@/actions/Llm/access'
import type { LlmSettingsView } from '@/sorse/types'

export async function llmRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const access = await llmAccess()
  const response = await fetch(`${access.url}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${access.token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
    cache: 'no-store',
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) {
    throw new Error(data && typeof data === 'object' && 'detail' in data ? String(data.detail) : 'Сервис модели ответил ошибкой')
  }
  return data as T
}

export async function readLlmSettings(): Promise<LlmSettingsView | null> {
  try {
    return await llmRequest<LlmSettingsView>('/v1/llm/settings')
  } catch {
    return null
  }
}
