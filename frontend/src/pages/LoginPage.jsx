import { useEffect, useRef, useState } from 'react'
import { getCurrentSession, getLoginStatus, logout, startLogin } from '../api/auth'
import Breadcrumb from '../components/layout/Breadcrumb.jsx'
import Panel from '../components/ui/Panel.jsx'
import ConfirmModal from '../components/ui/ConfirmModal.jsx'

// --- React concepts used in this file ---
//
// useState(initialValue) gives a component "memory" that survives between
// renders. It returns a [value, setter] pair; calling the setter schedules a
// re-render. You never assign to the variable directly.
//
// useEffect(fn, deps) runs `fn` after render and re-runs when a dep changes.
// `[]` means "once, after first render" — used below to look for an existing
// session on page load. The function it returns is the cleanup, which React
// runs on unmount — that's how we make sure the polling timer never leaks.
//
// useRef(initial) holds a mutable value that survives re-renders WITHOUT
// causing one when it changes — perfect for storing a timer id.
export default function LoginPage() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loginState, setLoginState] = useState(null)
  const [error, setError] = useState(null)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const pollRef = useRef(null)

  useEffect(() => {
    refreshSession()
    return () => stopPolling()
  }, [])

  async function refreshSession() {
    setLoading(true)
    try {
      setSession(await getCurrentSession())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  async function handleConnect() {
    setError(null)
    setLoginState({ status: 'waiting' })
    try {
      const { login_session_id } = await startLogin()

      pollRef.current = setInterval(async () => {
        try {
          const status = await getLoginStatus(login_session_id)
          setLoginState(status)
          if (status.status !== 'waiting') {
            stopPolling()
            if (status.status === 'connected') await refreshSession()
          }
        } catch (err) {
          stopPolling()
          setError(err.message)
        }
      }, 2000)
    } catch (err) {
      setError(err.message)
      setLoginState(null)
    }
  }

  async function handleLogout() {
    try {
      await logout()
      setSession(null)
      setLoginState(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setConfirmLogout(false)
    }
  }

  return (
    <>
      <Breadcrumb trail={[{ label: 'Instagram Login' }]} />

      <div className="page-content">
        <div className="container-fluid section">
          <div className="row justify-content-center">
            <div className="col-xl-7 col-lg-9">
              <Panel title="Instagram Connection" icon="ri-instagram-line">
                {error && (
                  <div className="alert alert-danger d-flex align-items-center gap-2">
                    <i className="ri-error-warning-line" />
                    {error}
                  </div>
                )}

                {loading ? (
                  <div className="d-flex align-items-center gap-2 text-muted-soft">
                    <span className="spinner-border spinner-border-sm" />
                    Checking session...
                  </div>
                ) : session ? (
                  <>
                    <div className="d-flex align-items-center gap-3 mb-3">
                      <span className="avatar avatar--fallback" style={{ width: 52, height: 52 }}>
                        <i className="ri-check-line" />
                      </span>
                      <div>
                        <div style={{ fontSize: 'var(--fs-title)', fontWeight: 600 }}>
                          @{session.ig_username}
                        </div>
                        <div className="media-card__meta">
                          Connected {new Date(session.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    <p className="text-muted-soft" style={{ fontSize: 'var(--fs-sm)' }}>
                      Your session is stored encrypted on this machine. Disconnecting only clears it
                      locally — it does not log you out of Instagram elsewhere.
                    </p>

                    <button
                      className="btn-gen btn-gen--danger"
                      onClick={() => setConfirmLogout(true)}
                    >
                      <i className="ri-logout-box-r-line" />
                      Disconnect
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-muted-soft" style={{ fontSize: 'var(--fs-sm)' }}>
                      Connect your own Instagram account to start tracking and downloading media you
                      are authorized to access. A real Instagram login window opens — enter your
                      credentials and complete any 2FA there directly.{' '}
                      <strong className="text-brand">This app never sees your password.</strong>
                    </p>

                    {loginState?.status === 'waiting' && (
                      <div className="alert alert-info d-flex align-items-center gap-2">
                        <span className="spinner-border spinner-border-sm" />
                        Waiting for you to finish logging in in the browser window...
                      </div>
                    )}
                    {loginState?.status === 'timed_out' && (
                      <div className="alert alert-warning">Login timed out. Please try again.</div>
                    )}
                    {loginState?.status === 'failed' && (
                      <div className="alert alert-danger">Login failed: {loginState.detail}</div>
                    )}
                    {loginState?.status === 'closed' && (
                      <div className="alert alert-warning">
                        Browser window was closed before login completed.
                      </div>
                    )}

                    <button
                      className="btn-gen"
                      onClick={handleConnect}
                      disabled={loginState?.status === 'waiting'}
                    >
                      <i className="ri-instagram-line" />
                      Connect Instagram Account
                    </button>
                  </>
                )}
              </Panel>
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={confirmLogout}
        title="Disconnect account"
        message="This clears the stored Instagram session from this machine. You'll need to log in again to download media."
        confirmLabel="Disconnect"
        onConfirm={handleLogout}
        onCancel={() => setConfirmLogout(false)}
      />
    </>
  )
}
