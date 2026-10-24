'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { maxLength, minLength, pipe, safeParse, string, trim } from 'valibot'
import addFriend from '@/actions/Friends/addFriend'
import { useUi } from '@/contexts/AuthContext'

const codeSchema = pipe(string(), trim(), minLength(1, 'Введите код'), maxLength(32, 'Максимальная длина кода — 32'))

export default function Page() {
  const router = useRouter()
  const { notify } = useUi()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    const parsed = safeParse(codeSchema, code)
    if (!parsed.success) {
      setError(parsed.issues[0].message)
      return
    }
    try {
      await addFriend(parsed.output)
      notify('Друг добавлен')
      router.push('/friends')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось добавить')
    }
  }

  return (
    <div>
      <header className="header">
        <button className="back" onClick={() => router.back()} aria-label="Назад">
          <ArrowLeft size={22} />
        </button>
        <h1>Код друга</h1>
      </header>
      <form className="pad stack" onSubmit={submit}>
        <p className="lead">Введите код. Чужие тексты и переписка не откроются.</p>
        <label className="field">
          <span>Код</span>
          <input className="input" value={code} onChange={(event) => setCode(event.target.value)} placeholder="IRA" />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="btn">Добавить</button>
      </form>
    </div>
  )
}
