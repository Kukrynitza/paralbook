import { SignJWT } from 'jose'

const baseUrl = (process.env.TEXT_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
const publicUrl = (process.env.NEXT_PUBLIC_TEXT_SERVICE_URL || baseUrl).replace(/\/$/, '')
const serviceToken = process.env.TEXT_SERVICE_TOKEN || 'dev-service-token'
const jwtSecret = process.env.TEXT_SERVICE_JWT_SECRET || process.env.JWT_SECRET_KEY || ''

export function textServicePublicUrl() {
  return publicUrl
}

async function serviceFetch(path: string, init: RequestInit = {}, timeoutMs = 30_000) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Service-Token': serviceToken,
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  })
  const text = await response.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (!response.ok) {
    const detail = data && typeof data === 'object' && 'detail' in data ? String((data as { detail: unknown }).detail) : text
    throw new Error(detail || `Сервис текста ответил ошибкой ${response.status}`)
  }
  return data
}

export interface TextJob {
  id: string
  userId: string
  type: 'chat' | 'import'
  status: 'queued' | 'running' | 'done' | 'error' | 'cancelled'
  stage: string | null
  progress: number
  textId: string | null
  error: string | null
  payload: Record<string, unknown> | null
  result: Record<string, unknown> | null
}

export async function startChatJob(input: {
  userId: string
  textId: string
  topic: string
  minutes: number
  level: string
}) {
  return (await serviceFetch('/v1/jobs/chat', {
    method: 'POST',
    body: JSON.stringify(input),
  })) as TextJob
}

export async function getTextServiceConfig() {
  return (await serviceFetch('/v1/config')) as {
    maxUploadBytes: number
    maxUploadText: number
    maxTranslateChars: number
  }
}

export interface ServiceHealth {
  ok: boolean
  latencyMs: number
  version: string | null
  lemmas: number | null
  wordForms: number | null
}

export async function textServiceHealth(): Promise<ServiceHealth> {
  const started = Date.now()
  try {
    const response = await fetch(`${baseUrl}/health`, {
      headers: { 'X-Service-Token': serviceToken },
      signal: AbortSignal.timeout(4000),
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(String(response.status))
    const data = (await response.json()) as {
      status?: string
      version?: string
      dictionary?: { lemmas?: number; wordForms?: number }
    }
    return {
      ok: data.status === 'ok',
      latencyMs: Date.now() - started,
      version: data.version ?? null,
      lemmas: data.dictionary?.lemmas ?? null,
      wordForms: data.dictionary?.wordForms ?? null,
    }
  } catch {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      version: null,
      lemmas: null,
      wordForms: null,
    }
  }
}

export async function getTextJob(jobId: string) {
  return (await serviceFetch(`/v1/jobs/${encodeURIComponent(jobId)}`)) as TextJob
}

export async function cancelTextJob(jobId: string) {
  return (await serviceFetch(`/v1/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' })) as { ok: boolean }
}

export async function signServiceToken(
  payload: { userId: string; textId?: string; jobId?: string; scope: 'import' | 'llm' },
  ttl = '15m',
) {
  if (!jwtSecret) throw new Error('Не задан TEXT_SERVICE_JWT_SECRET')
  return new SignJWT({ sub: payload.userId, textId: payload.textId, jobId: payload.jobId, scope: payload.scope })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(new TextEncoder().encode(jwtSecret))
}
