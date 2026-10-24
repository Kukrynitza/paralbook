'use server'

import { cookies } from 'next/headers'
import verifyJwt from './verifyJwt'

export default async function userId() {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) {
    return
  }
  try {
    const payload = await verifyJwt(token) as { id: string }

    return payload.id
  } catch {
    return
  }
}
