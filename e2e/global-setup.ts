import fs from 'node:fs'
import path from 'node:path'
import { SignJWT } from 'jose'
import { Client } from 'pg'

function readEnv(file: string) {
  const values: Record<string, string> = {}
  if (!fs.existsSync(file)) return values
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue
    const index = line.indexOf('=')
    values[line.slice(0, index).trim()] = line.slice(index + 1).trim()
  }
  return values
}

export default async function globalSetup() {
  const env = { ...readEnv(path.resolve('.env')), ...process.env }
  const secret = env.JWT_SECRET_KEY
  const userId = env.E2E_USER_ID
  if (!secret || !userId) {
    throw new Error('Для e2e задайте JWT_SECRET_KEY и E2E_USER_ID в .env или окружении')
  }
  const token = await new SignJWT({ id: userId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(secret))
  const state = {
    cookies: [
      {
        name: 'session',
        value: token,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax' as const,
        expires: Math.floor(Date.now() / 1000) + 7200,
      },
    ],
    origins: [],
  }
  fs.mkdirSync('e2e/.auth', { recursive: true })
  fs.writeFileSync('e2e/.auth/user.json', JSON.stringify(state, null, 2))

  const connectionString = env.DATABASE_CONNECTION_STRING
  if (connectionString) {
    const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
    await client.connect()
    try {
      await client.query("update texts set published=true where owner_id=$1 and title='Mario and Pizza'", [userId])
      await client.query(
        "update collection_items set source='chat' where user_id=$1 and text_id in (select id from texts where owner_id=$1 and title='Mario and Pizza')",
        [userId],
      )
      await client.query(
        "update collection_items set progress=0 where user_id=$1 and text_id='0f36f4fd-775d-4966-a05f-866b1cf1208c'",
        [userId],
      )
      await client.query("update user_words set context_en=null where user_id=$1 and lemma in ('as', 'that')", [userId])
      await client.query('delete from user_themes where user_id=$1', [userId]).catch(() => undefined)
      const updated = await client.query(
        `update user_words
         set context_en=$2, correct=0, wrong=0, interval_days=0, mastered=false, due_at=now()
         where user_id=$1 and lemma='that'`,
        [userId, 'PW context check for the first card.'],
      )
      if (!updated.rowCount) {
        await client.query(
          `insert into user_words (user_id, lemma, hint, correct, wrong, mastered, context_en, due_at, interval_days, ease)
           values ($1, 'that', '', 0, 0, false, $2, now(), 0, 2.5)`,
          [userId, 'PW context check for the first card.'],
        )
      }
    } finally {
      await client.end()
    }
  }
}
