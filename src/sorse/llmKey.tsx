import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const VERSION = 'v1'

function masterKey() {
  const secret = process.env.LLM_SETTINGS_SECRET || process.env.JWT_SECRET_KEY
  if (!secret) {
    throw new Error('Не задан LLM_SETTINGS_SECRET или JWT_SECRET_KEY')
  }
  return createHash('sha256').update(secret).digest()
}

export function encryptApiKey(apiKey: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', masterKey(), iv)
  const encrypted = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':')
}

export function decryptApiKey(stored: string) {
  const [version, iv, tag, encrypted] = stored.split(':')
  if (version !== VERSION || !iv || !tag || !encrypted) {
    throw new Error('Ключ сохранён в неизвестном формате')
  }
  const decipher = createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8')
}

export function apiKeyHint(apiKey: string | null | undefined) {
  const value = apiKey?.trim() ?? ''
  if (!value) return null
  if (value.length <= 8) return '••••'
  return value.slice(-4)
}
