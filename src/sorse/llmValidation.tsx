import { isLocalBaseUrl } from './llm'

export function validateLlmBaseUrl(value: string) {
  const base = value.trim()
  if (!base) return 'Укажите Base URL'
  if (base.length > 500) return 'Base URL слишком длинный'
  let url: URL
  try {
    url = new URL(base)
  } catch {
    return 'Некорректный Base URL'
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return 'Адрес должен начинаться с https:// или http://'
  }
  if (url.username || url.password) {
    return 'В адресе не должно быть логина и пароля'
  }
  if (url.protocol === 'http:' && !isLocalBaseUrl(base)) {
    return 'Для внешнего сервера используйте https://'
  }
  return
}

export function validateLlmModel(value: string) {
  const model = value.trim()
  if (!model) return 'Укажите название модели'
  if (model.length > 200) return 'Название модели слишком длинное'
  return
}

export function validateLlmApiKey(value: string) {
  const key = value.trim()
  if (key.length > 500) return 'API-ключ слишком длинный'
  if (/[\r\n]/.test(key)) return 'API-ключ должен быть одной строкой'
  return
}
