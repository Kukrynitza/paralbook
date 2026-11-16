'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import uploadText from '@/actions/Reading/uploadText'
import appendTwoBooksPages from '@/actions/Reading/appendTwoBooksPages'
import deleteText from '@/actions/Reading/deleteText'
import finishTwoBooksImport from '@/actions/Reading/finishTwoBooksImport'
import startTwoBooksImport from '@/actions/Reading/startTwoBooksImport'
import { parseBook } from '@/sorse/book'
import {
  decodeTwoBooksPage,
  openTwoBooks,
  readTwoBooksMeta,
  type TwoBooksMeta,
  type TwoBooksPage,
} from '@/sorse/book/twoBooks'
import { LEVELS, type Cefr } from '@/sorse/types'
import {
  MAX_TWO_BOOKS_BYTES,
  MAX_TWO_BOOKS_PAGES,
  MAX_TWO_BOOKS_TOKENS,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_TEXT,
  TWO_BOOKS_BATCH_PAGES,
  TWO_BOOKS_BATCH_TOKENS,
} from '@/sorse/uploadLimits'
import { useAuth, useUi } from '@/contexts/AuthContext'

const ACCEPT = [
  '.txt',
  '.text',
  '.md',
  '.markdown',
  '.fb2',
  '.epub',
  '.docx',
  '.2books',
  'text/plain',
  'text/markdown',
  'application/epub+zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
].join(',')

const MAX_MB = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)
const TWO_BOOKS_MB = Math.round(MAX_TWO_BOOKS_BYTES / 1024 / 1024)

function isTwoBooks(file: File) {
  return file.name.toLowerCase().endsWith('.2books')
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
  const [parsing, setParsing] = useState(false)
  const [fileName, setFileName] = useState('')
  const [twoBooks, setTwoBooks] = useState<File | null>(null)
  const [twoBooksMeta, setTwoBooksMeta] = useState<TwoBooksMeta | null>(null)
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState(0)
  const [importTotal, setImportTotal] = useState(0)

  async function pickFile(file: File) {
    setParsing(true)
    setFileName(file.name)
    try {
      if (isTwoBooks(file)) {
        if (file.size > MAX_TWO_BOOKS_BYTES) {
          throw new Error(`Файл .2books больше ${TWO_BOOKS_MB} МБ`)
        }
        const bytes = new Uint8Array(await file.arrayBuffer())
        const meta = readTwoBooksMeta(bytes)
        if (meta.isMonolingual) throw new Error('В книге нет параллельного перевода')
        if (meta.mainLang !== 'EN' || meta.secondaryLang !== 'RU') {
          throw new Error('Поддерживаются только книги с парой EN → RU')
        }
        if (meta.pages > MAX_TWO_BOOKS_PAGES) {
          throw new Error(`В книге слишком много страниц. Максимум — ${MAX_TWO_BOOKS_PAGES}.`)
        }
        setTwoBooks(file)
        setTwoBooksMeta(meta)
        setBody('')
        if (!title.trim()) setTitle(meta.title || file.name.replace(/\.2books$/i, ''))
      } else {
        setTwoBooks(null)
        setTwoBooksMeta(null)
        const book = await parseBook(file)
        setBody(book.text)
        if (!title.trim()) setTitle(book.title)
        if (book.warnings.length) notify(book.warnings[0])
      }
    } catch (reason) {
      setTwoBooks(null)
      setTwoBooksMeta(null)
      notify(reason instanceof Error ? reason.message : 'Не удалось разобрать файл')
    } finally {
      setParsing(false)
    }
  }

  async function importTwoBooks(file: File, meta: TwoBooksMeta) {
    setPending(true)
    setImporting(true)
    setImported(0)
    setImportTotal(meta.pages)
    let textId: string | null = null
    try {
      if (file.size > MAX_TWO_BOOKS_BYTES) {
        throw new Error(`Файл .2books больше ${TWO_BOOKS_MB} МБ`)
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      const bytes = new Uint8Array(await file.arrayBuffer())
      const book = openTwoBooks(bytes)
      setImportTotal(book.pages.length)
      const bookTitle = title.trim() || book.meta.title || file.name.replace(/\.2books$/i, '') || 'Своя книга'
      const bookTopic = topic.trim() || bookTitle
      const created = await startTwoBooksImport({
        title: bookTitle,
        topic: bookTopic,
        level,
        pages: book.pages.length,
        excerpt: book.meta.description || bookTitle,
      })
      textId = created
      let offset = 0
      let words = 0
      let chars = 0
      let totalTokens = 0
      let batch: TwoBooksPage[] = []
      let batchTokens = 0
      const flush = async () => {
        if (!batch.length) return
        await appendTwoBooksPages(created, offset, batch)
        offset += batch.length
        setImported(offset)
        batch = []
        batchTokens = 0
      }
      for (const pageFile of book.pages) {
        const page = decodeTwoBooksPage(pageFile.data, pageFile.position)
        const pageTokens = page.en.length + page.ru.length
        totalTokens += pageTokens
        if (totalTokens > MAX_TWO_BOOKS_TOKENS) throw new Error('В книге слишком много токенов')
        chars += page.en.reduce((sum, token) => sum + token.text.length, 0)
        if (chars > MAX_UPLOAD_TEXT) throw new Error('Английский текст книги слишком длинный')
        if (
          batch.length &&
          (batch.length >= TWO_BOOKS_BATCH_PAGES || batchTokens + pageTokens > TWO_BOOKS_BATCH_TOKENS)
        ) {
          await flush()
        }
        batch.push(page)
        batchTokens += pageTokens
        words += page.en.reduce((sum, token) => sum + (token.text.trim() ? 1 : 0), 0)
      }
      await flush()
      await finishTwoBooksImport(created, words)
      textId = null
      notify('Книга импортирована')
      router.push(`/read/${created}`)
    } catch (reason) {
      if (textId) {
        try {
          await deleteText(textId)
        } catch {
          // частичная книга могла уже удалиться
        }
      }
      notify(reason instanceof Error ? reason.message : 'Не удалось импортировать книгу')
    } finally {
      setPending(false)
      setImporting(false)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (twoBooks && twoBooksMeta) {
      await importTwoBooks(twoBooks, twoBooksMeta)
      return
    }
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

  const busy = pending || parsing || importing

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
        {twoBooksMeta ? (
          <div className="card pad stack">
            <b>{twoBooksMeta.title || 'Книга'}</b>
            {twoBooksMeta.author ? <span className="muted">{twoBooksMeta.author}</span> : null}
            <span className="muted">
              {twoBooksMeta.pages ? `${twoBooksMeta.pages} стр.` : 'Книга'} · {twoBooksMeta.mainLang} → {twoBooksMeta.secondaryLang} · параллельный перевод найден
            </span>
          </div>
        ) : (
          <label className="field">
            <span>Текст</span>
            <textarea className="input" rows={10} value={body} onChange={(event) => setBody(event.target.value)} />
          </label>
        )}
        <label className="field">
          <span>Или файл книги</span>
          <input
            type="file"
            accept={ACCEPT}
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void pickFile(file)
            }}
          />
          <span className="muted">
            {parsing
              ? `Разбираю ${fileName}…`
              : fileName || `FB2, EPUB, DOCX, Markdown, TXT — до ${MAX_MB} МБ; .2books — до ${TWO_BOOKS_MB} МБ`}
          </span>
        </label>
        <button className="btn" disabled={busy} type="submit">
          {importing
            ? `Импортирую ${imported} / ${importTotal}…`
            : pending
              ? 'Сохраняю…'
              : parsing
                ? 'Разбираю файл…'
                : 'Открыть в читалке'}
        </button>
      </form>
    </div>
  )
}
