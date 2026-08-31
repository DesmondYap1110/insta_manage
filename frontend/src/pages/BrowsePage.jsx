import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getAccount } from '../api/accounts'
import { clearDiscovered, downloadSelected, listDiscovered, startDiscover } from '../api/browse'
import { listJobs } from '../api/jobs'
import Breadcrumb from '../components/layout/Breadcrumb.jsx'
import Panel from '../components/ui/Panel.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import ConfirmModal from '../components/ui/ConfirmModal.jsx'
import StatusPill from '../components/ui/StatusPill.jsx'
import SelectableMediaCard from '../components/browse/SelectableMediaCard.jsx'

const TABS = [
  { kind: 'post', label: 'Posts', icon: 'ri-image-2-line' },
  { kind: 'reel', label: 'Reels', icon: 'ri-film-line' },
  { kind: 'story', label: 'Stories', icon: 'ri-history-line' },
  { kind: 'archive', label: 'Archive', icon: 'ri-archive-line' },
]

const FILTERS = [
  ['all', 'All'],
  ['new', 'Not downloaded'],
  ['saved', 'Downloaded'],
]

export default function BrowsePage() {
  const { accountId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const kind = searchParams.get('kind') || 'post'
  const filter = searchParams.get('filter') || 'all'

  const [account, setAccount] = useState(null)
  const [data, setData] = useState({ items: [], total: 0, counts: {} })
  const [selected, setSelected] = useState(() => new Set())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [activeJob, setActiveJob] = useState(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [fetchLimit, setFetchLimit] = useState(60)

  // Anchor for shift-click range selection.
  const lastIndexRef = useRef(null)
  const aliveRef = useRef(true)

  const load = useCallback(async () => {
    try {
      const downloaded = filter === 'new' ? false : filter === 'saved' ? true : undefined
      const result = await listDiscovered(accountId, { mediaKind: kind, downloaded, pageSize: 200 })
      if (aliveRef.current) setData(result)
    } catch (err) {
      if (aliveRef.current) setError(err.message)
    } finally {
      if (aliveRef.current) setLoading(false)
    }
  }, [accountId, kind, filter])

  useEffect(() => {
    aliveRef.current = true
    getAccount(accountId).then(setAccount).catch((err) => setError(err.message))
    return () => {
      aliveRef.current = false
    }
  }, [accountId])

  useEffect(() => {
    setLoading(true)
    setSelected(new Set())
    lastIndexRef.current = null
    load()
  }, [load])

  // While a discover/download job runs, poll so the grid fills in live.
  useEffect(() => {
    if (!activeJob) return undefined

    const interval = setInterval(async () => {
      try {
        const jobs = await listJobs(accountId)
        const job = jobs.find((j) => j.id === activeJob.id)
        if (!job) return
        setActiveJob(job)
        if (job.status === 'success' || job.status === 'failed') {
          clearInterval(interval)
          setActiveJob(null)
          if (job.status === 'failed') setError(job.error_message || 'Job failed')
          else setNotice('Finished.')
          await load()
        }
      } catch {
        // transient; next tick retries
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [activeJob, accountId, load])

  function setParam(key, value) {
    const next = new URLSearchParams(searchParams)
    next.set(key, value)
    setSearchParams(next)
  }

  // Toggle one tile, or select a contiguous range when Shift is held.
  //
  // The modifier key and anchor are read SYNCHRONOUSLY here, not inside the
  // setSelected updater: React defers that callback (and invokes it twice
  // under StrictMode), so reading event.shiftKey in there silently missed the
  // range and degraded to a plain single toggle.
  function toggle(id, index, event) {
    const isRange = Boolean(event?.shiftKey)
    const anchor = lastIndexRef.current

    setSelected((prev) => {
      const next = new Set(prev)

      if (isRange && anchor !== null) {
        const [from, to] = [anchor, index].sort((a, b) => a - b)
        const shouldSelect = !next.has(id)
        for (let i = from; i <= to; i += 1) {
          const row = data.items[i]
          if (!row) continue
          if (shouldSelect) next.add(row.id)
          else next.delete(row.id)
        }
      } else if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }

      return next
    })

    lastIndexRef.current = index
  }

  function selectAll() {
    setSelected(new Set(data.items.map((item) => item.id)))
  }

  function selectNone() {
    setSelected(new Set())
    lastIndexRef.current = null
  }

  function selectNotDownloaded() {
    setSelected(new Set(data.items.filter((i) => !i.is_downloaded).map((i) => i.id)))
  }

  async function handleDiscover() {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const job = await startDiscover(accountId, kind, fetchLimit)
      setActiveJob(job)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDownloadSelected() {
    if (selected.size === 0) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const job = await downloadSelected(accountId, [...selected])
      setActiveJob(job)
      setSelected(new Set())
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleClear() {
    try {
      await clearDiscovered(accountId)
      setConfirmClear(false)
      selectNone()
      await load()
    } catch (err) {
      setError(err.message)
      setConfirmClear(false)
    }
  }

  const hasSelection = selected.size > 0

  return (
    <>
      <Breadcrumb
        trail={[
          { label: 'Accounts', to: '/accounts' },
          { label: account ? `@${account.username}` : '...', to: `/accounts/${accountId}` },
          { label: 'Browse & Select' },
        ]}
      />

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

          <Panel
            title={account ? `Browse @${account.username}` : 'Browse'}
            icon="ri-search-eye-line"
            actions={
              <Link to={`/accounts/${accountId}`} className="btn-gen btn-gen--neutral btn-gen--sm">
                <i className="ri-arrow-left-line" />
                Back to account
              </Link>
            }
          >
            <div className="browse-tabs">
              {TABS.map((tab) => (
                <button
                  key={tab.kind}
                  className={`browse-tab${kind === tab.kind ? ' is-active' : ''}`}
                  onClick={() => setParam('kind', tab.kind)}
                >
                  <i className={tab.icon} />
                  {tab.label}
                  <span className="browse-tab__count">{data.counts?.[tab.kind] ?? 0}</span>
                </button>
              ))}
            </div>

            {/* Fetch controls */}
            <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
              <button className="btn-gen btn-gen--sm" onClick={handleDiscover} disabled={busy || activeJob}>
                <i className="ri-refresh-line" />
                {data.counts?.[kind] ? 'Refresh list' : 'Fetch list'}
              </button>

              {kind !== 'story' && (
                <div className="d-flex align-items-center gap-2">
                  <label className="mb-0" style={{ fontSize: 'var(--fs-sm)' }}>
                    {kind === 'archive' ? 'Scroll depth' : 'Latest'}
                  </label>
                  <select
                    className="form-select form-select-sm"
                    style={{ width: 'auto' }}
                    value={fetchLimit}
                    onChange={(e) => setFetchLimit(Number(e.target.value))}
                  >
                    {[30, 60, 120, 250, 500].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="d-flex align-items-center gap-2 ms-auto">
                {FILTERS.map(([value, label]) => (
                  <button
                    key={value}
                    className={`btn-gen btn-gen--sm ${
                      filter === value ? '' : 'btn-gen--neutral'
                    }`}
                    onClick={() => setParam('filter', value)}
                  >
                    {label}
                  </button>
                ))}
                <button
                  className="btn-gen btn-gen--danger btn-gen--sm"
                  onClick={() => setConfirmClear(true)}
                  title="Clear the cached listing"
                >
                  <i className="ri-delete-bin-line" />
                </button>
              </div>
            </div>

            {activeJob && (
              <div className="alert alert-info d-flex align-items-center gap-2">
                <span className="spinner-border spinner-border-sm" />
                <StatusPill status={activeJob.status} />
                {activeJob.progress_total > 0
                  ? `${activeJob.progress_current} / ${activeJob.progress_total}`
                  : 'Working...'}
              </div>
            )}

            {/* Selection bar */}
            <div className={`sel-bar${hasSelection ? ' is-active' : ''}`}>
              <span className="sel-bar__count">
                <strong>{selected.size}</strong> selected
              </span>
              <span className="sel-bar__hint">
                Click to select · Shift-click for a range
              </span>

              <div className="sel-bar__spacer" />

              <button className="btn-gen btn-gen--neutral btn-gen--sm" onClick={selectAll}>
                Select all
              </button>
              <button className="btn-gen btn-gen--neutral btn-gen--sm" onClick={selectNotDownloaded}>
                Select new
              </button>
              <button
                className="btn-gen btn-gen--neutral btn-gen--sm"
                onClick={selectNone}
                disabled={!hasSelection}
              >
                Clear
              </button>
              <button
                className="btn-gen btn-gen--sm"
                onClick={handleDownloadSelected}
                disabled={!hasSelection || busy || Boolean(activeJob)}
              >
                <i className="ri-download-2-line" />
                Download selected ({selected.size})
              </button>
            </div>

            {loading ? (
              <div className="empty-state">
                <span className="spinner-border spinner-border-sm me-2" />
                Loading...
              </div>
            ) : data.items.length === 0 ? (
              <EmptyState
                icon="ri-search-line"
                message={
                  data.counts?.[kind]
                    ? 'Nothing matches this filter.'
                    : `No ${kind}s listed yet. Click "Fetch list" to load what's available on Instagram.`
                }
              />
            ) : (
              <div className="sel-grid">
                {data.items.map((item, index) => (
                  <SelectableMediaCard
                    key={item.id}
                    item={item}
                    index={index}
                    accountId={accountId}
                    selected={selected.has(item.id)}
                    onToggle={toggle}
                  />
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>

      <ConfirmModal
        open={confirmClear}
        title="Clear listing"
        message="Remove the cached list of available media for this account? Downloaded files are not affected."
        confirmLabel="Clear"
        onConfirm={handleClear}
        onCancel={() => setConfirmClear(false)}
      />
    </>
  )
}
