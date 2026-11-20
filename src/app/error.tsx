'use client'

import Link from 'next/link'

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="empty">
      <h2>Что-то пошло не так</h2>
      <p>Страница не загрузилась. Можно попробовать ещё раз или вернуться в подборку.</p>
      <div className="actions" style={{ width: '100%' }}>
        <button className="btn" onClick={reset}>
          Повторить
        </button>
        <Link className="btn ghost" href="/">
          На главную
        </Link>
      </div>
    </div>
  )
}
