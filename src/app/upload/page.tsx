'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import uploadText from '@/actions/Reading/uploadText'
import { LEVELS, type Cefr } from '@/sorse/types'
import { useAuth, useUi } from '@/contexts/AuthContext'

async function readBook(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

export default function Page() {
  const { user } = useAuth()
  const { notify } = useUi()
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [topic, setTopic] = useState('')
  const [level, setLevel] = useState<Cefr>(user?.cefr ?? 'B1')
  const [body, setBody] = useState('')
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      const id = await uploadText({ title, topic, level, body })
      notify('Текст загружен')
      router.push(`/read/${id}`)
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Не удалось загрузить')
      setPending(false)
    }
  }

  return (
    <div>
      <header className="header">
        <h1>Загрузка</h1>
      </header>
      <form className="pad stack" onSubmit={(event) => void submit(event)}>
        <label className="field">
          <span>Название</span>
          <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="field">
          <span>Тема</span>
          <input className="input" value={topic} placeholder="Если пусто, берётся название" onChange={(event) => setTopic(event.target.value)} />
        </label>
        <label className="field">
          <span>Уровень</span>
          <select className="input" value={level} onChange={(event) => setLevel(event.target.value as Cefr)}>
            {LEVELS.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Текст</span>
          <textarea className="input" rows={10} value={body} onChange={(event) => setBody(event.target.value)} />
        </label>
        <label className="field">
          <span>Или файл .txt</span>
          <input
            type="file"
            accept=".txt,text/plain"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              if (!file) return
              const text = await readBook(file)
              setBody(text)
              if (!title) setTitle(file.name.replace(/\.txt$/i, ''))
            }}
          />
        </label>
        <button className="btn" disabled={pending} type="submit">
          {pending ? 'Сохраняю…' : 'Открыть в читалке'}
        </button>
      </form>
    </div>
  )
}
