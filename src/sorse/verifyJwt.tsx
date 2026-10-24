'use server'
import { jwtVerify } from 'jose'

export default async function verifyJwt(token: string) {
  const secretKey = process.env.JWT_SECRET_KEY
  if (!secretKey) {
    throw new Error('Не задан JWT_SECRET_KEY')
  }
  const key = new TextEncoder().encode(secretKey)
  const { payload } = await jwtVerify(token, key, {
    algorithms: ['HS256']
  })

  return payload
}
