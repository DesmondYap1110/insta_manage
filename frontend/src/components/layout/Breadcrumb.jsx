import { Link } from 'react-router-dom'

// `trail` is an array of { label, to? }. The last entry renders as the
// current (non-clickable) page, matching the admin theme's breadcrumb bar.
export default function Breadcrumb({ trail = [] }) {
  return (
    <section className="bc-section">
      <div className="bc-bar">
        <Link to="/" aria-label="Home">
          <i className="ri-dashboard-2-line" />
        </Link>
        {trail.map((crumb, index) => {
          const isLast = index === trail.length - 1
          return (
            <span key={`${crumb.label}-${index}`} className="d-inline-flex align-items-center gap-1">
              <span className="bc-bar__sep">
                <i className="ri-arrow-right-s-line" />
              </span>
              {isLast || !crumb.to ? (
                <span className="bc-bar__current">{crumb.label}</span>
              ) : (
                <Link to={crumb.to}>{crumb.label}</Link>
              )}
            </span>
          )
        })}
      </div>
    </section>
  )
}
