'use server'

import database from '@/modules/database'
import userId from '@/sorse/userId'
import { hashPassword, verifyPassword } from '@/sorse/password'

interface PasswordChange {
  current: string
  next: string
}

export default async function changePassword(input: PasswordChange) {
  const id = await userId()
  if (!id) {
    return 'Нужно войти'
  }
  const fromUser = await database
    .selectFrom('profiles')
    .select(['passwordHash'])
    .where('id', '=', id)
    .limit(1)
    .execute()

  if (!fromUser[0] || !await verifyPassword(input.current, fromUser[0].passwordHash)) {
    return 'Текущий пароль не подошёл'
  }
  await database
    .updateTable('profiles')
    .set({ passwordHash: await hashPassword(input.next) })
    .where('id', '=', id)
    .execute()
}
