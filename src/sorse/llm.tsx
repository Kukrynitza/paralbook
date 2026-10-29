export function modelReady() {
  return Boolean(process.env.LLM_API_KEY)
}

export async function chatText(system: string, user: string) {
  const key = process.env.LLM_API_KEY
  if (!key) throw new Error('Модель не настроена')
  const base = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
  const model = process.env.LLM_CHAT_MODEL || 'gpt-4o-mini'
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })
  if (!response.ok) throw new Error('Модель не ответила')
  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] }
  const text = data.choices?.[0]?.message?.content
  if (!text?.trim()) throw new Error('Модель не ответила')
  return text
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
