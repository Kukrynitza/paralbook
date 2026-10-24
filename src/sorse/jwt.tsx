'use server'
import { SignJWT } from 'jose'

interface User {
  id: string
}

export default async function jwt(payload: User): Promise<string> {
  const secretKey = process.env.JWT_SECRET_KEY
  if (!secretKey) {
    throw new Error('Не задан JWT_SECRET_KEY')
  }
  const key = new TextEncoder().encode(secretKey)
  const iat = Math.floor(Date.now() / 1000)
  const exp = iat + 2 * 24 * 60 * 60

  return new SignJWT({ id: payload.id })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setExpirationTime(exp)
    .setIssuedAt(iat)
    .setNotBefore(iat)
    .sign(key)
}
