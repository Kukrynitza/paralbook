import fs from 'node:fs'
import path from 'node:path'
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

const patterns = [
  "title like 'PW %'",
  "title like 'UI Test%'",
  "title like 'A Detective Cat'",
  "title like 'The Mystery of the Missing Science Book'",
  "topic like 'ZZZ %'",
  "topic like 'JobDock %'",
  "topic like 'Busy Lock %'",
]

export default async function globalTeardown() {
  const env = { ...readEnv(path.resolve('.env')), ...process.env }
  const connectionString = env.DATABASE_CONNECTION_STRING
  const userId = env.E2E_USER_ID
  if (!connectionString || !userId) return
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
  await client.connect()
  try {
    const active = await client.query(
      "select id from text_jobs where user_id=$1 and status in ('uploading', 'queued', 'running')",
      [userId],
    )
    for (const job of active.rows) {
      await fetch(`http://127.0.0.1:8000/v1/jobs/${job.id}/cancel`, {
        method: 'POST',
        headers: { 'X-Service-Token': env.TEXT_SERVICE_TOKEN || '' },
      }).catch(() => undefined)
    }
    const rows = await client.query(
      `select id from texts where owner_id=$1 and (${patterns.join(' or ')})`,
      [userId],
    )
    for (const row of rows.rows) {
      await client.query('delete from en_tokens where page_id in (select id from pages where text_id=$1)', [row.id])
      await client.query('delete from ru_tokens where page_id in (select id from pages where text_id=$1)', [row.id])
      await client.query('delete from pages where text_id=$1', [row.id])
      await client.query('delete from collection_items where text_id=$1', [row.id])
      await client.query('delete from chat_messages where text_id=$1', [row.id])
      await client.query('delete from text_jobs where text_id=$1', [row.id])
      await client.query('delete from texts where id=$1', [row.id])
    }
    await client.query(
      `delete from chat_messages where user_id=$1 and (
        body like 'PW %' or body like 'ZZZ %' or body like 'JobDock %' or body like 'Busy Lock %'
      )`,
      [userId],
    )
    await client.query(
      "delete from text_jobs where user_id=$1 and (text_id is null or text_id not in (select id from texts))",
      [userId],
    )
    await client.query(
      "update user_words set context_en=null where user_id=$1 and lemma in ('as', 'that')",
      [userId],
    )
    await client.query(
      "update collection_items set progress=0 where user_id=$1 and text_id='0f36f4fd-775d-4966-a05f-866b1cf1208c'",
      [userId],
    )
    await client.query(
      "update texts set published=true where owner_id=$1 and title='Mario and Pizza'",
      [userId],
    )
    await client.query(
      "update collection_items set source='chat' where user_id=$1 and text_id in (select id from texts where owner_id=$1 and title='Mario and Pizza')",
      [userId],
    )
    await client.query('delete from user_themes where user_id=$1', [userId]).catch(() => undefined)
  } finally {
    await client.end()
  }
}
