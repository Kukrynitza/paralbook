'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import logOut from '@/actions/LoginAndSign/LogOut'
import selectMe from '@/actions/Profile/selectMe'
import type { AlertItem, User } from '@/sorse/types'
import Alerts from '@/components/Alerts/Alerts'
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
  notifyError: (message: string, options?: { href?: string; linkLabel?: string; timeout?: number }) => void
  confirm: (message: string) => Promise<boolean>
  hasAlerts: boolean
} | null>(null)

export function UiProvider({ children }: { children: ReactNode }) {
  const [snack, setSnack] = useState<string | null>(null)
  const [ask, setAsk] = useState<Ask | null>(null)
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const alertTimers = useRef(new Map<string, number>())

  useEffect(() => {
    if (!snack) return
    const timer = window.setTimeout(() => setSnack(null), 2200)
    return () => window.clearTimeout(timer)
  }, [snack])

  useEffect(() => {
    const timers = alertTimers.current
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer)
      timers.clear()
    }
  }, [])

  function dismissAlert(id: string) {
    const timer = alertTimers.current.get(id)
    if (timer) window.clearTimeout(timer)
    alertTimers.current.delete(id)
    setAlerts((current) => current.filter((item) => item.id !== id))
  }

  const value = useMemo(
    () => ({
      notify: (message: string) => setSnack(message),
      notifyError: (
        message: string,
        options: { href?: string; linkLabel?: string; timeout?: number } = {},
      ) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        setAlerts((current) => {
          const same = current.find((item) => item.message === message)
          if (same) {
            return current.map((item) => (
              item.id === same.id ? { ...item, href: options.href, linkLabel: options.linkLabel } : item
            ))
          }
          return [...current.slice(-2), { id, message, href: options.href, linkLabel: options.linkLabel }]
        })
        const timer = window.setTimeout(() => dismissAlert(id), options.timeout ?? 9000)
        alertTimers.current.set(id, timer)
      },
      confirm: (message: string) =>
        new Promise<boolean>((resolve) => {
          setAsk({ message, resolve })
        }),
      hasAlerts: alerts.length > 0,
    }),
    [alerts.length],
  )

  return (
    <UiContext.Provider value={value}>
      {children}
      <Alerts items={alerts} onClose={dismissAlert} />
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
