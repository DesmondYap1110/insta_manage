import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteAccount, getAccount, syncAccount } from '../api/accounts'
import { createJob, listJobs } from '../api/jobs'
import { JOB_LABEL } from '../constants/media'
import Breadcrumb from '../components/layout/Breadcrumb.jsx'
import Panel from '../components/ui/Panel.jsx'
import StatusPill from '../components/ui/StatusPill.jsx'
import ConfirmModal from '../components/ui/ConfirmModal.jsx'
import DataTable from '../components/datatable/DataTable.jsx'

const ACTIONS = [
  { type: 'download_posts', label: 'Download All Posts', icon: 'ri-image-2-line', variant: '' },
  { type: 'download_reels', label: 'Download Reels', icon: 'ri-film-line', variant: '' },
  { type: 'download_stories', label: 'Download Stories', icon: 'ri-history-line', variant: '' },
  {
    type: 'download_archive',
    label: 'Download Story Archive',
    icon: 'ri-archive-line',
    variant: '',
    // Instagram only exposes the archive to its owner.
    ownAccountOnly: true,
  },
]

export default function AccountDetailPage() {
  // useParams() reads the dynamic segment of the URL. App.jsx registers this
  // page at "/accounts/:accountId", so visiting /accounts/7 gives "7" here.
  const { accountId } = useParams()
  const navigate = useNavigate()

  const [account, setAccount] = useState(null)
  const [jobs, setJobs] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [notFound, setNotFound] = useState(false)

  // Guards against setting state after the component unmounts (which happens
  // easily here because a 3s timer keeps firing requests in the background).
  const aliveRef = useRef(true)

  const loadJobs = useCallback(async () => {
    try {
      const data = await listJobs(accountId)
      if (aliveRef.current) setJobs(data)
    } catch {
      // Polling errors are non-fatal and would otherwise spam the alert box.
    }
  }, [accountId])

  const loadAccount = useCallback(async () => {
    try {
      const data = await getAccount(accountId)
      if (aliveRef.current) setAccount(data)
    } catch (err) {
      if (aliveRef.current) {
        setNotFound(true)
        setError(err.message)
      }
    }
  }, [accountId])

  useEffect(() => {
    aliveRef.current = true
    loadAccount()
    loadJobs()

    // Poll so job status/progress updates live without a manual refresh.
    const interval = setInterval(loadJobs, 3000)
    return () => {
      aliveRef.current = false
      clearInterval(interval)
    }
  }, [loadAccount, loadJobs])

  async function runJob(jobType, extra = {}) {
    setBusy(true)
    setError(null)
    try {
      await createJob({ accountId: Number(accountId), jobType, ...extra })
      await loadJobs()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleSync() {
    setBusy(true)
    setError(null)
    try {
      setAccount(await syncAccount(accountId))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    try {
      await deleteAccount(accountId)
      // Client-side navigation — a full page reload here would throw away
      // the SPA state and flash the whole app.
      navigate('/accounts', { replace: true })
    } catch (err) {
      setError(err.message)
      setConfirmDelete(false)
    }
  }

  const jobColumns = [
    {
      key: 'job_type',
      header: 'Type',
      sortable: true,
      value: (row) => JOB_LABEL[row.job_type] || row.job_type,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      className: 'text-center',
      headerClassName: 'text-center',
      render: (row) => <StatusPill status={row.status} />,
    },
    {
      key: 'progress',
      header: 'Progress',
      className: 'text-center',
      headerClassName: 'text-center',
      value: (row) => (row.progress_total > 0 ? row.progress_current / row.progress_total : 0),
      render: (row) =>
        row.progress_total > 0 ? `${row.progress_current} / ${row.progress_total}` : '—',
    },
    {
      key: 'created_at',
      header: 'Created',
      sortable: true,
      className: 'text-center',
      headerClassName: 'text-center',
      render: (row) => new Date(row.created_at).toLocaleString(),
    },
    {
      key: 'error_message',
      header: 'Error',
      value: (row) => row.error_message || '',
      render: (row) =>
        row.error_message ? (
          <span style={{ color: 'var(--c-danger)' }}>{row.error_message}</span>
        ) : (
          '—'
        ),
    },
  ]

  if (notFound) {
    return (
      <>
        <Breadcrumb trail={[{ label: 'Accounts', to: '/accounts' }, { label: 'Not found' }]} />
        <div className="page-content">
          <div className="container-fluid section">
            <Panel title="Account not found" icon="ri-error-warning-line">
              <p style={{ fontSize: 'var(--fs-sm)' }}>{error}</p>
              <Link to="/accounts" className="btn-gen btn-gen--sm">
                <i className="ri-arrow-left-line" />
                Back to accounts
              </Link>
            </Panel>
          </div>
        </div>
      </>
    )
  }

  if (!account) {
    return (
      <>
        <Breadcrumb trail={[{ label: 'Accounts', to: '/accounts' }, { label: 'Loading' }]} />
        <div className="page-content">
          <div className="container-fluid section">
            <Panel>
              <div className="empty-state">
                <span className="spinner-border spinner-border-sm me-2" />
                Loading account...
              </div>
            </Panel>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Breadcrumb
        trail={[{ label: 'Accounts', to: '/accounts' }, { label: `@${account.username}` }]}
      />

      <div className="page-content">
        <div className="container-fluid section">
          {error && (
            <div className="alert alert-danger d-flex align-items-center gap-2">
              <i className="ri-error-warning-line" />
              {error}
            </div>
          )}

          <Panel>
            <div className="d-flex gap-3 align-items-start flex-wrap">
              {account.profile_pic_path ? (
                <img
                  src={`/files/${account.profile_pic_path}`}
                  alt={account.username}
                  className="avatar avatar--lg"
                />
              ) : (
                <span className="avatar avatar--lg avatar--fallback">
                  <i className="ri-user-3-line" />
                </span>
              )}

              <div className="flex-grow-1">
                <h1 className="panel__title mb-1" style={{ fontSize: 18 }}>
                  @{account.username}
                </h1>
                {account.full_name && <div className="text-muted-soft">{account.full_name}</div>}
                {account.biography && (
                  <p className="mt-2 mb-2" style={{ fontSize: 'var(--fs-sm)' }}>
                    {account.biography}
                  </p>
                )}
                <div className="d-flex gap-3 flex-wrap align-items-center media-card__meta">
                  <span>
                    <strong>{account.posts_count ?? '—'}</strong> posts
                  </span>
                  <span>
                    <strong>{account.followers_count?.toLocaleString() ?? '—'}</strong> followers
                  </span>
                  <span>
                    <strong>{account.following_count?.toLocaleString() ?? '—'}</strong> following
                  </span>
                  <StatusPill variant={account.is_private ? 'warning' : 'success'}>
                    {account.is_private ? 'Private' : 'Public'}
                  </StatusPill>
                </div>
                {account.last_synced_at && (
                  <div className="media-card__meta mt-1">
                    Last synced {new Date(account.last_synced_at).toLocaleString()}
                  </div>
                )}
              </div>

              <button
                className="btn-gen btn-gen--danger btn-gen--sm"
                onClick={() => setConfirmDelete(true)}
              >
                <i className="ri-delete-bin-6-line" />
                Remove
              </button>
            </div>
          </Panel>

          <div className="mt-3">
            <Panel title="Download Actions" icon="ri-download-cloud-2-line">
              <div className="d-flex flex-wrap gap-2 mb-3">
                <button
                  className="btn-gen btn-gen--neutral btn-gen--sm"
                  onClick={handleSync}
                  disabled={busy}
                >
                  <i className="ri-refresh-line" />
                  Sync Profile
                </button>

                {ACTIONS.map((action) => (
                  <button
                    key={action.type}
                    className="btn-gen btn-gen--sm"
                    onClick={() => runJob(action.type)}
                    disabled={busy}
                  >
                    <i className={action.icon} />
                    {action.label}
                  </button>
                ))}

                <Link
                  className="btn-gen btn-gen--navy btn-gen--sm"
                  to={`/media?account_id=${accountId}`}
                >
                  <i className="ri-folder-open-line" />
                  View in Library
                </Link>
              </div>

              <div className="d-flex align-items-center gap-2 flex-wrap pt-2 border-top">
                <i className="ri-information-line text-brand" />
                <span style={{ fontSize: 'var(--fs-sm)' }}>
                  Want to pick individual items instead of downloading everything?
                </span>
                <Link
                  className="btn-gen btn-gen--info btn-gen--sm"
                  to={`/accounts/${accountId}/browse`}
                >
                  <i className="ri-search-eye-line" />
                  Browse &amp; Select
                </Link>
              </div>
            </Panel>
          </div>

          <div className="mt-3">
            <Panel title="Job History" icon="ri-time-line" bodyClassName="px-0">
              <DataTable
                columns={jobColumns}
                rows={jobs}
                defaultPageSize={10}
                emptyIcon="ri-inbox-line"
                emptyMessage="No download jobs yet for this account."
              />
            </Panel>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={confirmDelete}
        title="Remove account"
        message={`Remove @${account.username}? This also deletes its downloaded media records.`}
        confirmLabel="Remove"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  )
}
