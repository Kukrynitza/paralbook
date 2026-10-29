'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import logOut from '@/actions/LoginAndSign/LogOut'
import selectMe from '@/actions/Profile/selectMe'
import type { User } from '@/sorse/types'
import styles from './AuthContext.module.css'

interface AuthValue {
  user: User | null
  ready: boolean
  login: (user: User) => void
  logout: () => void
  setUser: (user: User) => void
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true
    selectMe()
      .then((next) => {
        if (active) setUserState(next ?? null)
      })
      .catch(() => {
        if (active) setUserState(null)
      })
      .finally(() => {
        if (active) setReady(true)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const pref = user?.theme ?? 'system'
      const resolved = pref === 'system' ? (media.matches ? 'dark' : 'light') : pref
      document.documentElement.dataset.theme = resolved
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [user?.theme])

  const value = useMemo<AuthValue>(
    () => ({
      user,
      ready,
      login: (nextUser) => {
        setUserState(nextUser)
      },
      logout: () => {
        void logOut().finally(() => setUserState(null))
      },
      setUser: setUserState,
    }),
    [ready, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('AuthProvider')
  return value
}

interface Ask {
  message: string
  resolve: (ok: boolean) => void
}

const UiContext = createContext<{
  notify: (message: string) => void
  confirm: (message: string) => Promise<boolean>
} | null>(null)

export function UiProvider({ children }: { children: ReactNode }) {
  const [snack, setSnack] = useState<string | null>(null)
  const [ask, setAsk] = useState<Ask | null>(null)

  useEffect(() => {
    if (!snack) return
    const timer = window.setTimeout(() => setSnack(null), 4200)
    return () => window.clearTimeout(timer)
  }, [snack])

  const value = useMemo(
    () => ({
      notify: (message: string) => setSnack(message),
      confirm: (message: string) =>
        new Promise<boolean>((resolve) => {
          setAsk({ message, resolve })
        }),
    }),
    [],
  )

  return (
    <UiContext.Provider value={value}>
      {children}
      {snack ? <div className={styles.snack}>{snack}</div> : null}
      {ask ? (
        <div className="modal-dim">
          <div className="modal">
            <h2>Подтвердите</h2>
            <p>{ask.message}</p>
            <div className="actions">
              <button
                className="btn ghost"
                onClick={() => {
                  ask.resolve(false)
                  setAsk(null)
                }}
              >
                Отмена
              </button>
              <button
                className="btn"
                onClick={() => {
                  ask.resolve(true)
                  setAsk(null)
                }}
              >
                Да
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </UiContext.Provider>
  )
}

export function useUi() {
  const value = useContext(UiContext)
  if (!value) throw new Error('UiProvider')
  return value
}
