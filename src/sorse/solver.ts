const base = () => (process.env.SOLVER_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

export default async function solver<T>(path: string, body?: unknown): Promise<T> {
  const url = `${base()}${path}`
  let response: Response
  try {
    response = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      cache: 'no-store',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new Error('Решатель недоступен. В другом терминале из каталога paralbook: npm run solver')
  }
  const payload = (await response.json().catch(() => null)) as { detail?: string } | T | null
  if (!response.ok) {
    const detail = payload && typeof payload === 'object' && 'detail' in payload ? payload.detail : undefined
    throw new Error(typeof detail === 'string' ? detail : 'Решатель недоступен')
  }
  return payload as T
}
