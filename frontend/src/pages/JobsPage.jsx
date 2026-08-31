import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { listAccounts } from '../api/accounts'
import { listJobs } from '../api/jobs'
import { JOB_LABEL } from '../constants/media'
import Breadcrumb from '../components/layout/Breadcrumb.jsx'
import Panel from '../components/ui/Panel.jsx'
import StatusPill from '../components/ui/StatusPill.jsx'
import DataTable from '../components/datatable/DataTable.jsx'

export default function JobsPage() {
  const [jobs, setJobs] = useState([])
  const [accountsById, setAccountsById] = useState({})
  const [loading, setLoading] = useState(true)
  const aliveRef = useRef(true)

  const load = useCallback(async () => {
    try {
      const data = await listJobs()
      if (aliveRef.current) setJobs(data)
    } catch {
      // Non-fatal: the poller retries on the next tick.
    } finally {
      if (aliveRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    aliveRef.current = true

    listAccounts()
      .then((accounts) => {
        if (aliveRef.current) {
          setAccountsById(Object.fromEntries(accounts.map((a) => [a.id, a.username])))
        }
      })
      .catch(() => {})

    load()
    const interval = setInterval(load, 3000)

    return () => {
      aliveRef.current = false
      clearInterval(interval)
    }
  }, [load])

  const columns = [
    {
      key: 'account_id',
      header: 'Account',
      sortable: true,
      value: (row) => accountsById[row.account_id] || String(row.account_id),
      render: (row) => (
        <Link to={`/accounts/${row.account_id}`} className="text-brand">
          @{accountsById[row.account_id] || row.account_id}
        </Link>
      ),
    },
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
      key: 'finished_at',
      header: 'Finished',
      sortable: true,
      className: 'text-center',
      headerClassName: 'text-center',
      value: (row) => row.finished_at || '',
      render: (row) => (row.finished_at ? new Date(row.finished_at).toLocaleString() : '—'),
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

  return (
    <>
      <Breadcrumb trail={[{ label: 'Background Jobs' }]} />

      <div className="page-content">
        <div className="container-fluid section">
          <Panel title="Background Jobs" icon="ri-loader-2-line" bodyClassName="px-0">
            {loading ? (
              <div className="empty-state">
                <span className="spinner-border spinner-border-sm me-2" />
                Loading jobs...
              </div>
            ) : (
              <DataTable
                columns={columns}
                rows={jobs}
                exportable
                exportFilename="download-jobs"
                defaultPageSize={25}
                emptyIcon="ri-inbox-line"
                emptyMessage="No download jobs yet. Trigger one from an account page."
              />
            )}
          </Panel>
        </div>
      </div>
    </>
  )
}
