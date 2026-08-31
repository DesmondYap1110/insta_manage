import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCurrentSession } from '../../api/auth'
import { useAuth } from '../../auth/AuthContext.jsx'

// Shows two independent things, deliberately kept visually distinct:
//   1. which Instagram account the app is connected to (for downloading)
//   2. which admin is signed in to this back office
export default function Topbar({ onToggleSidebar, refreshKey }) {
  const { admin, logout } = useAuth()
  const [session, setSession] = useState(null)

  useEffect(() => {
    let cancelled = false
    getCurrentSession()
      .then((data) => {
        if (!cancelled) setSession(data)
      })
      .catch(() => {
        if (!cancelled) setSession(null)
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  return (
    <header className="app-topbar">
      <button
        type="button"
        className="app-topbar__toggle"
        onClick={onToggleSidebar}
        aria-label="Toggle navigation"
      >
        <i className="ri-menu-2-line" />
      </button>

      <div className="app-topbar__spacer" />

      <div className="app-topbar__session">
        <span className={`app-topbar__dot${session ? ' is-online' : ''}`} />
        {session ? (
          <span>
            IG: <strong>@{session.ig_username}</strong>
          </span>
        ) : (
          <span>IG: not connected</span>
        )}
      </div>

      <div className="app-topbar__divider" />

      <div className="app-topbar__admin">
        <span className="app-topbar__avatar">
          <i className="ri-user-3-line" />
        </span>
        <span className="d-none d-sm-inline">{admin?.username}</span>
        <Link to="/settings" className="app-topbar__icon-btn" title="Settings">
          <i className="ri-settings-3-line" />
        </Link>
        <button
          type="button"
          className="app-topbar__icon-btn app-topbar__icon-btn--danger"
          onClick={logout}
          title="Sign out"
        >
          <i className="ri-logout-box-r-line" />
        </button>
      </div>
    </header>
  )
}
