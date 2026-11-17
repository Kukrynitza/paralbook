'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import selectTheme from '@/actions/Theme/selectTheme'
import saveTheme from '@/actions/Theme/saveTheme'
import { useAuth, useUi } from '@/contexts/AuthContext'
import { applyTheme, clearAppliedTheme, readThemeCache } from '@/sorse/themePrefs'
import { DEFAULT_THEME, normalizeTheme, type ThemeMode, type ThemePrefs } from '@/sorse/themeTypes'

interface ThemeValue {
  prefs: ThemePrefs
  ready: boolean
  save: (next: ThemePrefs) => void
  reset: () => void
}

const ThemeContext = createContext<ThemeValue | null>(null)
const STORAGE_KEY = 'paralbook.theme.v1'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, ready: authReady } = useAuth()
  const { notifyError } = useUi()
  const pathname = usePathname() ?? '/'
  const [prefs, setPrefs] = useState<ThemePrefs>(DEFAULT_THEME)
  const [ready, setReady] = useState(false)
  const timer = useRef<number | null>(null)
  const pending = useRef<ThemePrefs | null>(null)

  useEffect(() => {
    const cached = readThemeCache()
    if (cached) setPrefs(cached.prefs)
  }, [])

  useEffect(() => {
    if (!authReady) return
    if (!user) {
      clearAppliedTheme()
      setPrefs(DEFAULT_THEME)
      setReady(true)
      return
    }
    let active = true
    selectTheme()
      .then((stored) => {
        if (!active) return
        const fallback = normalizeTheme(readThemeCache()?.prefs ?? null, user.theme)
        const next = stored ? normalizeTheme(stored) : fallback
        setPrefs(next)
        setReady(true)
      })
      .catch(() => {
        if (active) setReady(true)
      })
    return () => {
      active = false
    }
  }, [authReady, user?.id, user?.theme])

  useEffect(() => {
    if (!ready) return
    applyTheme(prefs, pathname)
  }, [prefs, pathname, ready])

  useEffect(() => {
    if (prefs.mode !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => applyTheme(prefs, pathname)
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [prefs, pathname])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return
      const cached = readThemeCache()
      if (cached) setPrefs(cached.prefs)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [])

  function persist(next: ThemePrefs) {
    pending.current = next
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const value = pending.current
      if (!value) return
      saveTheme(value).catch((reason) => {
        notifyError(reason instanceof Error ? reason.message : 'Не удалось сохранить тему')
      })
    }, 450)
  }

  function save(next: ThemePrefs) {
    const value = normalizeTheme(next)
    setPrefs(value)
    applyTheme(value, pathname)
    persist(value)
  }

  const value = useMemo<ThemeValue>(
    () => ({
      prefs,
      ready,
      save,
      reset: () => save(DEFAULT_THEME),
    }),
    [prefs, ready, pathname],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('ThemeProvider')
  return value
}

export type { ThemeMode }
