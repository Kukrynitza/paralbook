export default function Loading() {
  return (
    <div className="pad stack" aria-label="Загрузка">
      <div className="skeleton skeleton-title" />
      <div className="card stack">
        <div className="skeleton skeleton-line" />
        <div className="skeleton skeleton-line short" />
        <div className="skeleton skeleton-block" />
      </div>
      <div className="card stack">
        <div className="skeleton skeleton-line" />
        <div className="skeleton skeleton-line short" />
      </div>
    </div>
  )
}
