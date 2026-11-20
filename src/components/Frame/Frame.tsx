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
import type { CSSProperties, ReactNode } from 'react'
import JobDock from '@/components/JobDock/JobDock'
import { useTheme } from '@/contexts/ThemeContext'
import type { SectionId } from '@/sorse/themeTypes'
import styles from './Frame.module.css'

function NavItem({
  to,
  end = false,
  section,
  children,
}: {
  to: string
  end?: boolean
  section: SectionId
  children: ReactNode
}) {
  const pathname = usePathname() ?? ''
  const { prefs } = useTheme()
  const on = end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`)
  const style = { '--item-color': prefs.sections[section] } as CSSProperties
  return (
    <Link href={to} className={on ? styles.on : ''} style={style}>
      {children}
    </Link>
  )
}

const tabs = [
  { to: '/', label: 'Подборка', icon: BookOpen, end: true, section: 'collection' as SectionId },
  { to: '/library', label: 'Библиотека', icon: Library, end: false, section: 'library' as SectionId },
  { to: '/chat', label: 'Чат', icon: MessageSquare, end: false, section: 'chat' as SectionId },
  { to: '/vocabulary', label: 'Словарь', icon: FileText, end: false, section: 'words' as SectionId },
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
        <Link href="/" className={styles.brand} aria-label="На главную">
          Paralbook
        </Link>
        {tabs.map((item) => (
          <NavItem key={item.to} to={item.to} end={item.end} section={item.section}>
            <item.icon size={18} />
            {item.label}
          </NavItem>
        ))}
        <NavItem to="/friends" section="friends">
          <Users size={18} />
          Друзья
        </NavItem>
        <NavItem to="/stats" section="stats">
          <BarChart3 size={18} />
          Статистика
        </NavItem>
        <div className={styles.sideGap} />
        <NavItem to="/settings" section="settings">
          <Settings size={18} />
          Настройки
        </NavItem>
      </aside>
      <div className={styles.phone}>
        <div className={styles.phoneBody}>{children}</div>
        <JobDock aboveNav={showTabs} />
        {showTabs ? (
          <nav className={styles.tabs}>
            {tabs.map((item) => (
              <NavItem key={item.to} to={item.to} end={item.end} section={item.section}>
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
