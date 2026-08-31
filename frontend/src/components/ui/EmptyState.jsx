export default function EmptyState({ icon = 'ri-inbox-line', message, children }) {
  return (
    <div className="empty-state">
      <i className={icon} />
      <p>{message}</p>
      {children && <div className="mt-3">{children}</div>}
    </div>
  )
}
