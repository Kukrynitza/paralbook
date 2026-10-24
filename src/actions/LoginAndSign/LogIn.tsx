'use server'

import { cookies } from 'next/headers'
import database from '@/modules/database'
import jwt from '@/sorse/jwt'
import { verifyPassword } from '@/sorse/password'

interface LogInUser {
  email: string
  password: string
}

export default async function logIn(user: LogInUser) {
  const fromUser = await database
    .selectFrom('profiles')
    .select(['id', 'passwordHash'])
    .where('email', '=', user.email.trim().toLowerCase())
    .limit(1)
    .execute()

  if (!fromUser[0]) {
    return 'Неверный email или пароль'
  }
  if (!await verifyPassword(user.password, fromUser[0].passwordHash)) {
    return 'Неверный email или пароль'
  }

  const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
  const token = await jwt({ id: fromUser[0].id })
  const cookieStore = await cookies()
  cookieStore.set('session', token, {
    expires: expiresAt,
    httpOnly: true,
    path: '/',
    sameSite: 'lax'
  })
}
