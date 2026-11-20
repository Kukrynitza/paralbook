'use server'

import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import database from '@/modules/database'
import jwt from '@/sorse/jwt'
import { hashPassword } from '@/sorse/password'

interface InsertUser {
  email: string
  password: string
}

export default async function insertUser(user: InsertUser) {
  const email = user.email.trim().toLowerCase()
  const fromUsers = await database
    .selectFrom('profiles')
    .select(['email'])
    .where('email', '=', email)
    .execute()

  if (fromUsers.length > 0) {
    return 'Такой email уже зарегистрирован'
  }

  const registration = await database
    .insertInto('profiles')
    .values({
      email,
      passwordHash: await hashPassword(user.password),
      friendCode: randomBytes(4).toString('hex'),
      cefr: 'B1',
      interests: [],
      dailyGoalMin: 20,
      showMinutes: false,
      theme: 'system',
      streak: 0
    })
    .returning(['id'])
    .executeTakeFirstOrThrow()

  const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
  const token = await jwt({ id: registration.id })
  const cookieStore = await cookies()
  cookieStore.set('session', token, {
    expires: expiresAt,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    sameSite: 'lax'
  })
}
