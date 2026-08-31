import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { addAccount, deleteAccount, listAccounts, syncAccount } from '../api/accounts'
import Breadcrumb from '../components/layout/Breadcrumb.jsx'
import Panel from '../components/ui/Panel.jsx'
import StatusPill from '../components/ui/StatusPill.jsx'
import ConfirmModal from '../components/ui/ConfirmModal.jsx'
import DataTable from '../components/datatable/DataTable.jsx'

export default function AccountsPage() {
  const navigate = useNavigate()
  const [accounts, setAccounts] = useState([])
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      setAccounts(await listAccounts())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault() // stop the browser's default full-page form submit
    if (!username.trim()) return

    setSubmitting(true)
    setError(null)
    setNotice(null)
    try {
      await addAccount(username.trim())
      setUsername('')
      setNotice('Account added and profile synced.')
    } catch (err) {
      setError(err.message)
    } finally {
      // Always reload: the backend creates the row even when the profile
      // fetch fails (e.g. no session yet), so the list must reflect that
      // rather than silently hiding the new account.
      await load()
      setSubmitting(false)
    }
  }

  async function handleSync(account) {
    setBusyId(account.id)
    setError(null)
    setNotice(null)
    try {
      await syncAccount(account.id)
      setNotice(`@${account.username} synced.`)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return
    setBusyId(pendingDelete.id)
    try {
      await deleteAccount(pendingDelete.id)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setPendingDelete(null)
      setBusyId(null)
    }
  }

  const columns = [
    {
      key: 'no',
      header: 'No',
      className: 'text-center',
      headerClassName: 'text-center',
      searchable: false,
      // Row number reflects the current sorted/filtered order, so it comes
      // from the table's own index rather than the source array position.
      render: (_row, index) => index + 1,
    },
    {
      key: 'username',
      header: 'Account',
      sortable: true,
      // The cell shows username *and* full name, so both must be searchable.
      value: (row) => `${row.username} ${row.full_name || ''}`.trim(),
      render: (row) => (
        <div className="d-flex align-items-center gap-2">
          {row.profile_pic_path ? (
            <img
              src={`/files/${row.profile_pic_path}`}
              alt={row.username}
              className="avatar"
              style={{ width: 36, height: 36 }}
            />
          ) : (
            <span className="avatar avatar--fallback" style={{ width: 36, height: 36, fontSize: 15 }}>
              <i className="ri-user-3-line" />
            </span>
          )}
          <div>
            <Link to={`/accounts/${row.id}`} className="text-brand fw-semibold">
              @{row.username}
            </Link>
            {row.full_name && <div className="media-card__meta">{row.full_name}</div>}
          </div>
        </div>
      ),
    },
    {
      key: 'posts_count',
      header: 'Posts',
      sortable: true,
      className: 'text-center',
      headerClassName: 'text-center',
      render: (row) => row.posts_count ?? '—',
    },
    {
      key: 'followers_count',
      header: 'Followers',
      sortable: true,
      className: 'text-center',
      headerClassName: 'text-center',
      render: (row) => row.followers_count?.toLocaleString() ?? '—',
    },
    {
      key: 'is_private',
      header: 'Visibility',
      className: 'text-center',
      headerClassName: 'text-center',
      value: (row) => (row.is_private ? 'Private' : 'Public'),
      render: (row) => (
        <StatusPill variant={row.is_private ? 'warning' : 'success'}>
          {row.is_private ? 'Private' : 'Public'}
        </StatusPill>
      ),
    },
    {
      key: 'last_synced_at',
      header: 'Last Synced',
      sortable: true,
      className: 'text-center',
      headerClassName: 'text-center',
      value: (row) => row.last_synced_at || '',
      render: (row) =>
        row.last_synced_at ? (
          new Date(row.last_synced_at).toLocaleString()
        ) : (
          <span className="text-muted-soft">Never</span>
        ),
    },
    {
      key: 'action',
      header: 'Action',
      className: 'text-center',
      headerClassName: 'text-center',
      searchable: false,
      value: () => '',
      render: (row) => (
        <div className="d-inline-flex">
          <button
            type="button"
            className="ac-btn ac-btn--view"
            title="Open account"
            onClick={() => navigate(`/accounts/${row.id}`)}
          >
            <i className="ri-eye-line" />
          </button>
          <button
            type="button"
            className="ac-btn ac-btn--edit"
            title="Sync profile"
            disabled={busyId === row.id}
            onClick={() => handleSync(row)}
          >
            <i className={busyId === row.id ? 'ri-loader-4-line' : 'ri-refresh-line'} />
          </button>
          <button
            type="button"
            className="ac-btn ac-btn--delete"
            title="Remove account"
            onClick={() => setPendingDelete(row)}
          >
            <i className="ri-delete-bin-6-line" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <>
      <Breadcrumb trail={[{ label: 'Accounts' }]} />

      <div className="page-content">
        <div className="container-fluid section">
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

          <Panel title="Add Account" icon="ri-user-add-line">
            <form className="row g-2 align-items-center" onSubmit={handleSubmit}>
              <div className="col-auto flex-grow-1" style={{ maxWidth: 340 }}>
                <input
                  type="text"
                  className="form-control"
                  placeholder="instagram_username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div className="col-auto">
                <button type="submit" className="btn-gen btn-gen--sm" disabled={submitting}>
                  <i className="ri-add-line" />
                  {submitting ? 'Adding...' : 'Add Account'}
                </button>
              </div>
            </form>
          </Panel>

          <div className="mt-3">
            <Panel title="Tracked Accounts" icon="ri-list-check-2" bodyClassName="px-0">
              {loading ? (
                <div className="empty-state">
                  <span className="spinner-border spinner-border-sm me-2" />
                  Loading accounts...
                </div>
              ) : (
                <DataTable
                  columns={columns}
                  rows={accounts}
                  exportable
                  exportFilename="tracked-accounts"
                  emptyIcon="ri-user-search-line"
                  emptyMessage="No tracked accounts yet. Add a username above to fetch its profile."
                />
              )}
            </Panel>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={Boolean(pendingDelete)}
        title="Remove account"
        message={
          pendingDelete
            ? `Remove @${pendingDelete.username}? This also deletes its downloaded media records.`
            : ''
        }
        confirmLabel="Remove"
        busy={busyId === pendingDelete?.id}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  )
}
