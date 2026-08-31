// A white card with the theme's title bar — the equivalent of the admin
// theme's #tb-box / .general-box wrapper. `actions` renders on the right of
// the header (buttons, filters, etc).
export default function Panel({ title, icon, actions, children, bodyClassName = '' }) {
  return (
    <div className="panel">
      {(title || actions) && (
        <div className="panel__head">
          {title && (
            <p className="panel__title">
              {icon && <i className={`${icon} me-2`} />}
              {title}
            </p>
          )}
          {actions && <div className="ms-auto d-flex gap-2 flex-wrap">{actions}</div>}
        </div>
      )}
      <div className={`panel__body ${bodyClassName}`}>{children}</div>
    </div>
  )
}
