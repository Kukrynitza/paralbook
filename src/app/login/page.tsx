'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { email, minLength, pipe, safeParse, string, trim } from 'valibot'
import logIn from '@/actions/LoginAndSign/LogIn'
import selectMe from '@/actions/Profile/selectMe'
import { useAuth } from '@/contexts/AuthContext'
import PasswordField from '@/components/PasswordField/PasswordField'

const filled = 'Заполните email и пароль'
const emailSchema = pipe(string(), trim(), minLength(1, filled), email('Нужен адрес почты'))
const passwordSchema = pipe(string(), minLength(1, filled))

export default function Page() {
  const { user, login } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  useEffect(() => {
    if (user) router.replace('/')
  }, [user, router])
  if (user) return null

  async function submit(event: FormEvent) {
    event.preventDefault()
    const emailCheck = safeParse(emailSchema, email)
    if (!emailCheck.success) {
      setError(emailCheck.issues[0].message)
      return
    }
    const passwordCheck = safeParse(passwordSchema, password)
    if (!passwordCheck.success) {
      setError(passwordCheck.issues[0].message)
      return
    }
    setPending(true)
    setError('')
    try {
      const error = await logIn({ email: emailCheck.output, password: passwordCheck.output })
      if (error) {
        setError(error)
        return
      }
      const me = await selectMe()
      if (me) login(me)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось войти')
    } finally {
      setPending(false)
    }
  }

  return (
    <div>
      <header className="header">
        <h1>Вход</h1>
      </header>
      <form className="stack pad" onSubmit={submit} style={{ paddingTop: 32 }}>
      <p className="lead">Войдите, чтобы продолжить чтение и изучение слов.</p>
      <label className="field">
        <span>Email</span>
        <input className="input" value={email} placeholder="name@example.com" autoComplete="email" onChange={(event) => setEmail(event.target.value)} />
      </label>
      <PasswordField label="Пароль" value={password} onChange={setPassword} autoComplete="current-password" />
      {error ? <p className="form-error">{error}</p> : null}
      <button className="btn" disabled={pending}>
        Войти
      </button>
      <Link className="link" href="/register">
        Создать аккаунт
      </Link>
      </form>
    </div>
  )
}
