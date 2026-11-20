import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="empty">
      <h2>Страница не найдена</h2>
      <p>Возможно, ссылка устарела или текст был удалён.</p>
      <Link className="btn" href="/">
        Вернуться в подборку
      </Link>
    </div>
  )
}
