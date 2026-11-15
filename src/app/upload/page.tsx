'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import uploadText from '@/actions/Reading/uploadText'
import { parseBook } from '@/sorse/book'
import { LEVELS, type Cefr } from '@/sorse/types'
import { MAX_UPLOAD_BYTES } from '@/sorse/uploadLimits'
import { useAuth, useUi } from '@/contexts/AuthContext'

const ACCEPT = [
  '.txt',
  '.text',
  '.md',
  '.markdown',
  '.fb2',
  '.epub',
  '.docx',
  'text/plain',
  'text/markdown',
  'application/epub+zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
].join(',')

const MAX_MB = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)

export default function Page() {
  const { user } = useAuth()
  const { notify } = useUi()
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [topic, setTopic] = useState('')
  const [level, setLevel] = useState<Cefr>(user?.cefr ?? 'B1')
  const [body, setBody] = useState('')
  const [pending, setPending] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [fileName, setFileName] = useState('')

  async function pickFile(file: File) {
    setParsing(true)
    setFileName(file.name)
    try {
      const book = await parseBook(file)
      setBody(book.text)
      if (!title.trim()) setTitle(book.title)
      if (book.warnings.length) notify(book.warnings[0])
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Не удалось разобрать файл')
    } finally {
      setParsing(false)
    }
  }

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
          <span>Или файл книги</span>
          <input
            type="file"
            accept={ACCEPT}
            disabled={parsing || pending}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void pickFile(file)
            }}
          />
          <span className="muted">
            {parsing ? `Разбираю ${fileName}…` : fileName || `FB2, EPUB, DOCX, Markdown или TXT — до ${MAX_MB} МБ`}
          </span>
        </label>
        <button className="btn" disabled={pending || parsing} type="submit">
          {pending ? 'Сохраняю…' : parsing ? 'Разбираю файл…' : 'Открыть в читалке'}
        </button>
      </form>
    </div>
  )
}
