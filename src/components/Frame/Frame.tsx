'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  BookOpen,
  FileText,
  Library,
  MessageSquare,
  Settings,
  Users,
} from 'lucide-react'
import type { ReactNode } from 'react'
import styles from './Frame.module.css'

function NavItem({ to, end = false, children }: { to: string; end?: boolean; children: ReactNode }) {
  const pathname = usePathname() ?? ''
  const on = end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`)
  return (
    <Link href={to} className={on ? styles.on : ''}>
      {children}
    </Link>
  )
}

const tabs = [
  { to: '/', label: 'Подборка', icon: BookOpen, end: true },
  { to: '/library', label: 'Библиотека', icon: Library, end: false },
  { to: '/chat', label: 'Чат', icon: MessageSquare, end: false },
  { to: '/vocabulary', label: 'Словарь', icon: FileText, end: false },
]

export default function Frame({
  children,
  tabs: showTabs = false,
  nav = true,
  reading = false,
}: {
  children: ReactNode
  tabs?: boolean
  nav?: boolean
  reading?: boolean
}) {
  const className = [styles.frame, nav ? '' : styles.solo, reading ? styles.reading : ''].filter(Boolean).join(' ')
  return (
    <div className={className}>
      <aside className={styles.sidebar}>
        <p className={styles.brand}>Paralbook</p>
        {tabs.map((item) => (
          <NavItem key={item.to} to={item.to} end={item.end}>
            <item.icon size={18} />
            {item.label}
          </NavItem>
        ))}
        <NavItem to="/friends">
          <Users size={18} />
          Друзья
        </NavItem>
        <NavItem to="/stats">
          <BarChart3 size={18} />
          Статистика
        </NavItem>
        <div className={styles.sideGap} />
        <NavItem to="/settings">
          <Settings size={18} />
          Настройки
        </NavItem>
      </aside>
      <div className={styles.phone}>
        <div className={styles.phoneBody}>{children}</div>
        {showTabs ? (
          <nav className={styles.tabs}>
            {tabs.map((item) => (
              <NavItem key={item.to} to={item.to} end={item.end}>
                <item.icon size={24} />
                {item.label}
              </NavItem>
            ))}
          </nav>
        ) : null}
      </div>
    </div>
  )
}
