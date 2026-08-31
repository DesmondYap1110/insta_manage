import { useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'

export default function AdminLoginPage() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(username.trim(), password)
    } catch (err) {
      setError(err.message)
    } finally {
      // Drop the password from component state either way, so it isn't
      // left sitting in memory after the request completes.
      setPassword('')
      setSubmitting(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-card__brand">
          <i className="ri-instagram-line" />
          <div>
            <div className="login-card__title">Instagram Media Manager</div>
            <div className="login-card__subtitle">Back Office</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="login-card__body">
          {error && (
            <div className="alert alert-danger d-flex align-items-center gap-2">
              <i className="ri-error-warning-line" />
              {error}
            </div>
          )}

          <div className="mb-3">
            <label htmlFor="username" className="form-label">
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              className="form-control"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div className="mb-4">
            <label htmlFor="password" className="form-label">
              Password
            </label>
            <div className="login-card__password">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                className="form-control"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="login-card__reveal"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <i className={showPassword ? 'ri-eye-off-line' : 'ri-eye-line'} />
              </button>
            </div>
          </div>

          <button type="submit" className="btn-gen w-100" disabled={submitting}>
            {submitting ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" />
                Signing in...
              </>
            ) : (
              <>
                <i className="ri-login-box-line" />
                Sign In
              </>
            )}
          </button>
        </form>

        <div className="login-card__foot">
          <i className="ri-lock-2-line me-1" />
          Local back office — credentials are stored hashed on this machine.
        </div>
      </div>
    </div>
  )
}
