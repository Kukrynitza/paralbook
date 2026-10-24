'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import selectFriends from '@/actions/Friends/selectFriends'
import { type Friend } from '@/sorse/types'
import dayWord from '@/sorse/dayWord'
import friendStyles from '@/components/FriendCard/FriendCard.module.css'

export default function Page() {
  const router = useRouter()
  const [items, setItems] = useState<Friend[]>([])

  useEffect(() => {
    selectFriends().then((data) => setItems(data.items))
  }, [])

  return (
    <div>
      <header className="header">
        <button className="back" onClick={() => router.back()} aria-label="Назад">
          <ArrowLeft size={22} />
        </button>
        <h1>Друзья</h1>
      </header>
      <div className="pad">
        <div className="row">
          <h2 style={{ margin: 0 }}>Друзья сегодня</h2>
          <Link href="/friends/add" className="link" style={{ width: 'auto' }}>
            Добавить
          </Link>
        </div>
        {items.length === 0 ? (
          <div className="empty">
            <h2>Пока никого нет</h2>
            <p>Добавьте друга по коду. Ленты и переписки здесь нет.</p>
            <Link className="btn" href="/friends/add">
              Добавить друга
            </Link>
          </div>
        ) : (
          items.map((friend) => (
            <div className={friendStyles.friend} key={friend.id}>
              <div className={`${friendStyles.avatar} ${friendStyles.lg}`}>{friend.name.slice(0, 1)}</div>
              <div>
                <div className={friendStyles.name}>{friend.name}</div>
                <div className={friendStyles.sub}>{friend.minutesLabel}</div>
              </div>
              <div className={friendStyles.streak}>
                {friend.streak} {dayWord(friend.streak)}
                <small>серия</small>
              </div>
            </div>
          ))
        )}
        {items.length > 0 ? (
          <>
            <Link className="btn" href="/friends/add" style={{ marginTop: 16 }}>
              Добавить друга
            </Link>
            <p className="small muted" style={{ marginTop: 12 }}>
              Друзья видят только минуты сегодня и серию
            </p>
          </>
        ) : null}
      </div>
    </div>
  )
}
