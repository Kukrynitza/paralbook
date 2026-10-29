'use client'

import { useEffect, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Frame from '@/components/Frame/Frame'
import { AuthProvider, UiProvider, useAuth } from '@/contexts/AuthContext'

const openPages = ['/login', '/register']

function FrameForPath({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, ready } = useAuth()
  const open = openPages.includes(pathname)
  const reading = pathname.startsWith('/read')

  useEffect(() => {
    if (!open && ready && !user) router.replace('/login')
  }, [open, ready, user, router])

  if (!open && (!ready || !user)) {
    return (
      <Frame nav={false}>
        <p className="loading">Загрузка…</p>
      </Frame>
    )
  }

  if (open) return <Frame nav={false}>{children}</Frame>

  return (
    <Frame tabs reading={reading}>
      {children}
    </Frame>
  )
}

export default function Shell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <UiProvider>
        <FrameForPath>{children}</FrameForPath>
      </UiProvider>
    </AuthProvider>
  )
}
