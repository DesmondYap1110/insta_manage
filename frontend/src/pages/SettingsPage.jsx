import { useState } from 'react'
import { changePassword } from '../api/admin'
import { useAuth } from '../auth/AuthContext.jsx'
import Breadcrumb from '../components/layout/Breadcrumb.jsx'
import Panel from '../components/ui/Panel.jsx'

const MIN_LENGTH = 8

export default function SettingsPage() {
  const { admin } = useAuth()
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setNotice(null)

    if (form.next.length < MIN_LENGTH) {
      setError(`New password must be at least ${MIN_LENGTH} characters.`)
      return
    }
    if (form.next !== form.confirm) {
      setError('New password and confirmation do not match.')
      return
    }

    setSubmitting(true)
    try {
      await changePassword(form.current, form.next)
      setNotice('Password updated.')
    } catch (err) {
      setError(err.message)
    } finally {
      // Never leave passwords sitting in component state.
      setForm({ current: '', next: '', confirm: '' })
      setSubmitting(false)
    }
  }

  return (
    <>
      <Breadcrumb trail={[{ label: 'Settings' }]} />

      <div className="page-content">
        <div className="container-fluid section">
          <div className="row justify-content-center">
            <div className="col-xl-6 col-lg-8">
              <Panel title="Change Password" icon="ri-lock-password-line">
                <p className="text-muted-soft" style={{ fontSize: 'var(--fs-sm)' }}>
                  Signed in as <strong className="text-brand">{admin?.username}</strong>. Passwords
                  are stored as bcrypt hashes — never in plaintext.
                </p>

                {error && (
                  <div className="alert alert-danger d-flex align-items-center gap-2">
                    <i className="ri-error-warning-line" />
                    {error}
                  </div>
                )}
                {notice && (
                  <div className="alert alert-success d-flex align-items-center gap-2">
                    <i className="ri-check-line" />
                    {notice}
                  </div>
                )}

                <form onSubmit={handleSubmit}>
                  <div className="mb-3">
                    <label className="form-label" htmlFor="current">
                      Current password
                    </label>
                    <input
                      id="current"
                      type="password"
                      className="form-control"
                      autoComplete="current-password"
                      value={form.current}
                      onChange={(e) => update('current', e.target.value)}
                      required
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label" htmlFor="next">
                      New password
                    </label>
                    <input
                      id="next"
                      type="password"
                      className="form-control"
                      autoComplete="new-password"
                      value={form.next}
                      onChange={(e) => update('next', e.target.value)}
                      required
                    />
                    <div className="media-card__meta mt-1">Minimum {MIN_LENGTH} characters.</div>
                  </div>

                  <div className="mb-4">
                    <label className="form-label" htmlFor="confirm">
                      Confirm new password
                    </label>
                    <input
                      id="confirm"
                      type="password"
                      className="form-control"
                      autoComplete="new-password"
                      value={form.confirm}
                      onChange={(e) => update('confirm', e.target.value)}
                      required
                    />
                  </div>

                  <button type="submit" className="btn-gen" disabled={submitting}>
                    <i className="ri-save-line" />
                    {submitting ? 'Saving...' : 'Update Password'}
                  </button>
                </form>
              </Panel>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
