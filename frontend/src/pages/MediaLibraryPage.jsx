import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { listAccounts } from '../api/accounts'
import { getCurrentSession } from '../api/auth'
import {
  bulkDeleteMedia,
  categoryCounts,
  deleteMedia,
  exportMedia,
  listMedia,
  matchingIds,
  yearCounts,
} from '../api/media'
import { CATEGORIES, MEDIA_TYPE_OPTIONS } from '../constants/media'
import Breadcrumb from '../components/layout/Breadcrumb.jsx'
import Panel from '../components/ui/Panel.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import ConfirmModal from '../components/ui/ConfirmModal.jsx'
import MediaCard from '../components/media/MediaCard.jsx'
import MediaModal from '../components/media/MediaModal.jsx'

function buildPageList(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages = new Set([1, total, current, current - 1, current + 1])
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  const withGaps = []
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) withGaps.push('gap')
    withGaps.push(page)
  })
  return withGaps
}

export default function MediaLibraryPage() {
  // useSearchParams mirrors the URL query string (?account_id=3&page=2) into
  // state. Keeping filters in the URL means the "View in Library" link from
  // an account page can pre-filter this page, and the view is shareable.
  const [searchParams, setSearchParams] = useSearchParams()
  const accountId = searchParams.get('account_id') || ''
  const mediaType = searchParams.get('media_type') || ''
  const category = searchParams.get('category') || ''
  const year = searchParams.get('year') || ''
  const dateFrom = searchParams.get('date_from') || ''
  const dateTo = searchParams.get('date_to') || ''
  const page = Math.max(1, Number(searchParams.get('page') || '1'))

  const filterParams = { accountId, mediaType, category, year, dateFrom, dateTo }

  const [accounts, setAccounts] = useState([])
  const [sessionUsername, setSessionUsername] = useState(null)
  const [counts, setCounts] = useState({})
  const [years, setYears] = useState([])
  const [data, setData] = useState({ items: [], total: 0, page: 1, page_size: 40 })
  const [selected, setSelected] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const lastIndexRef = useRef(null)

  useEffect(() => {
    listAccounts()
      .then(setAccounts)
      .catch((err) => setError(err.message))
    getCurrentSession()
      .then((session) => setSessionUsername(session?.ig_username || null))
      .catch(() => setSessionUsername(null))
  }, [])

  // No account picker in the UI — the library scopes itself to whichever
  // Instagram account is currently logged in, matched against the tracked
  // accounts list. A link that already carries ?account_id= (e.g. "View in
  // Library" from an account page) is left alone.
  useEffect(() => {
    if (!sessionUsername || accounts.length === 0) return
    if (searchParams.get('account_id')) return
    const match = accounts.find((a) => a.username === sessionUsername)
    if (!match) return
    const next = new URLSearchParams(searchParams)
    next.set('account_id', String(match.id))
    setSearchParams(next, { replace: true })
  }, [sessionUsername, accounts])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const [result, tallies, yearTallies] = await Promise.all([
          listMedia({ ...filterParams, page }),
          categoryCounts(filterParams),
          // Year counts follow the active category, so switching tabs shows
          // only the years that category actually has.
          yearCounts(filterParams),
        ])
        if (!cancelled) {
          setData(result)
          setCounts(tallies)
          setYears(yearTallies)
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [accountId, mediaType, category, year, dateFrom, dateTo, page])

  // Filters changed out from under an in-progress selection — drop it rather
  // than risk bulk-deleting items the user can no longer see.
  useEffect(() => {
    setSelectedIds(new Set())
    lastIndexRef.current = null
  }, [accountId, mediaType, category, year, dateFrom, dateTo])

  // Changing a *filter* must reset to page 1, but changing the *page* must
  // not — conflating the two previously reset every page click back to 1,
  // which made pagination look broken.
  function updateFilter(key, value) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    next.set('page', '1')
    setSearchParams(next)
  }

  function clearDateRange() {
    const next = new URLSearchParams(searchParams)
    next.delete('date_from')
    next.delete('date_to')
    next.set('page', '1')
    setSearchParams(next)
  }

  // Switching category also clears the year: a year present in one category
  // often has nothing in another, which would land the user on an empty grid.
  function selectCategory(nextCategory) {
    const next = new URLSearchParams(searchParams)
    if (nextCategory) next.set('category', nextCategory)
    else next.delete('category')
    next.delete('year')
    next.set('page', '1')
    setSearchParams(next)
  }

  function goToPage(nextPage) {
    const next = new URLSearchParams(searchParams)
    next.set('page', String(nextPage))
    setSearchParams(next)
  }

  async function reload() {
    const [result, tallies] = await Promise.all([
      listMedia({ ...filterParams, page }),
      categoryCounts(filterParams),
    ])
    setData(result)
    setCounts(tallies)
  }

  async function handleDelete() {
    if (!pendingDelete) return
    try {
      await deleteMedia(pendingDelete.id)
      setSelected(null)
      setPendingDelete(null)
      await reload()
    } catch (err) {
      setError(err.message)
      setPendingDelete(null)
    }
  }

  function toggleSelectionMode() {
    setSelectionMode((prev) => !prev)
    setSelectedIds(new Set())
    lastIndexRef.current = null
  }

  // Toggle one tile, or select a contiguous range (within the current page)
  // when Shift is held — same pattern as the Browse & Select grid.
  function toggle(id, index, event) {
    const isRange = Boolean(event?.shiftKey)
    const anchor = lastIndexRef.current

    setSelectedIds((prev) => {
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

  // The grid only ever holds one page at a time, but a filter (especially a
  // date range) can match thousands of rows across many pages — so "select
  // all" asks the backend for every matching id instead of just this page's.
  async function selectAllMatching() {
    setBusy(true)
    setError(null)
    try {
      const ids = await matchingIds(filterParams)
      setSelectedIds(new Set(ids))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function clearSelection() {
    setSelectedIds(new Set())
    lastIndexRef.current = null
  }

  async function handleBulkDelete() {
    setBusy(true)
    setError(null)
    try {
      await bulkDeleteMedia([...selectedIds])
      setConfirmBulkDelete(false)
      clearSelection()
      await reload()
    } catch (err) {
      setError(err.message)
      setConfirmBulkDelete(false)
    } finally {
      setBusy(false)
    }
  }

  async function handleExport() {
    setBusy(true)
    setError(null)
    try {
      await exportMedia([...selectedIds])
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.page_size))
  const showingFrom = data.total === 0 ? 0 : (page - 1) * data.page_size + 1
  const showingTo = Math.min(page * data.page_size, data.total)
  const hasSelection = selectedIds.size > 0
  const activeAccount = accounts.find((a) => String(a.id) === accountId)

  const filters = (
    <>
      {activeAccount && (
        <span
          className="d-inline-flex align-items-center gap-1"
          style={{ fontSize: 'var(--fs-sm)', color: 'var(--c-text-muted)' }}
          title="Auto-detected from the logged-in Instagram account"
        >
          <i className="ri-user-line" />@{activeAccount.username}
        </span>
      )}

      <select
        className="form-select form-select-sm"
        style={{ width: 'auto' }}
        value={mediaType}
        onChange={(e) => updateFilter('media_type', e.target.value)}
      >
        {MEDIA_TYPE_OPTIONS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      <div className="d-flex align-items-center gap-1">
        <input
          type="date"
          className="form-control form-control-sm"
          style={{ width: 'auto' }}
          value={dateFrom}
          max={dateTo || undefined}
          title="From date"
          onChange={(e) => updateFilter('date_from', e.target.value)}
        />
        <span className="text-muted-soft" style={{ fontSize: 'var(--fs-xs)' }}>
          to
        </span>
        <input
          type="date"
          className="form-control form-control-sm"
          style={{ width: 'auto' }}
          value={dateTo}
          min={dateFrom || undefined}
          title="To date"
          onChange={(e) => updateFilter('date_to', e.target.value)}
        />
        {(dateFrom || dateTo) && (
          <button
            type="button"
            className="btn-gen btn-gen--neutral btn-gen--sm"
            onClick={clearDateRange}
            title="Clear date range"
          >
            <i className="ri-close-line" />
          </button>
        )}
      </div>

      <button
        type="button"
        className={`btn-gen btn-gen--sm ${selectionMode ? '' : 'btn-gen--neutral'}`}
        onClick={toggleSelectionMode}
      >
        <i className="ri-checkbox-multiple-line" />
        {selectionMode ? 'Cancel selection' : 'Select'}
      </button>
    </>
  )

  return (
    <>
      <Breadcrumb trail={[{ label: 'Media Library' }]} />

      <div className="page-content">
        <div className="container-fluid section">
          {error && (
            <div className="alert alert-danger d-flex align-items-center gap-2">
              <i className="ri-error-warning-line" />
              {error}
            </div>
          )}

          <Panel title="Media Library" icon="ri-image-2-line" actions={filters}>
            <div className="browse-tabs">
              {CATEGORIES.map((tab) => (
                <button
                  key={tab.key || 'all'}
                  className={`browse-tab${category === tab.key ? ' is-active' : ''}`}
                  onClick={() => selectCategory(tab.key)}
                >
                  <i className={tab.icon} />
                  {tab.label}
                  <span className="browse-tab__count">{counts[tab.key || 'all'] ?? 0}</span>
                </button>
              ))}
            </div>

            {years.length > 0 && (
              <div className="year-chips">
                <span className="year-chips__label">
                  <i className="ri-calendar-line me-1" />
                  Year
                </span>
                <button
                  className={`year-chip${year === '' ? ' is-active' : ''}`}
                  onClick={() => updateFilter('year', '')}
                >
                  All
                </button>
                {years.map((entry) => (
                  <button
                    key={entry.year}
                    className={`year-chip${String(entry.year) === year ? ' is-active' : ''}`}
                    onClick={() => updateFilter('year', String(entry.year))}
                  >
                    {entry.year}
                    <span className="year-chip__count">{entry.count}</span>
                  </button>
                ))}
              </div>
            )}

            {selectionMode && (
              <div className={`sel-bar${hasSelection ? ' is-active' : ''}`}>
                <span className="sel-bar__count">
                  <strong>{selectedIds.size}</strong> selected
                </span>
                <span className="sel-bar__hint">Click to select · Shift-click for a range</span>

                <div className="sel-bar__spacer" />

                <button
                  className="btn-gen btn-gen--neutral btn-gen--sm"
                  onClick={selectAllMatching}
                  disabled={busy}
                >
                  Select all ({data.total})
                </button>
                <button
                  className="btn-gen btn-gen--neutral btn-gen--sm"
                  onClick={clearSelection}
                  disabled={!hasSelection}
                >
                  Clear
                </button>
                <button
                  className="btn-gen btn-gen--neutral btn-gen--sm"
                  onClick={handleExport}
                  disabled={!hasSelection || busy}
                >
                  <i className="ri-download-2-line" />
                  Export ({selectedIds.size})
                </button>
                <button
                  className="btn-gen btn-gen--danger btn-gen--sm"
                  onClick={() => setConfirmBulkDelete(true)}
                  disabled={!hasSelection || busy}
                >
                  <i className="ri-delete-bin-line" />
                  Delete ({selectedIds.size})
                </button>
              </div>
            )}

            {loading ? (
              <div className="empty-state">
                <span className="spinner-border spinner-border-sm me-2" />
                Loading media...
              </div>
            ) : data.items.length === 0 ? (
              <EmptyState
                icon="ri-image-add-line"
                message="No media found for these filters. Run a download job from an account page."
              />
            ) : (
              <>
                <div className="dt__info mb-3">
                  Showing {showingFrom} to {showingTo} of {data.total} items
                </div>

                <div className="media-grid">
                  {data.items.map((item, index) => (
                    <MediaCard
                      key={item.id}
                      item={item}
                      onClick={() => setSelected(item)}
                      selectable={selectionMode}
                      selected={selectedIds.has(item.id)}
                      onToggle={(event) => toggle(item.id, index, event)}
                    />
                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="dt__footer">
                    <div className="dt__info">
                      Page {page} of {totalPages}
                    </div>
                    <ul className="dt__pagination">
                      <li>
                        <button
                          type="button"
                          className="dt__page"
                          disabled={page === 1}
                          onClick={() => goToPage(page - 1)}
                        >
                          <i className="ri-arrow-left-s-line" />
                        </button>
                      </li>
                      {buildPageList(page, totalPages).map((entry, index) =>
                        entry === 'gap' ? (
                          <li key={`gap-${index}`} className="dt__ellipsis">
                            &hellip;
                          </li>
                        ) : (
                          <li key={entry}>
                            <button
                              type="button"
                              className={`dt__page${entry === page ? ' is-active' : ''}`}
                              onClick={() => goToPage(entry)}
                            >
                              {entry}
                            </button>
                          </li>
                        )
                      )}
                      <li>
                        <button
                          type="button"
                          className="dt__page"
                          disabled={page === totalPages}
                          onClick={() => goToPage(page + 1)}
                        >
                          <i className="ri-arrow-right-s-line" />
                        </button>
                      </li>
                    </ul>
                  </div>
                )}
              </>
            )}
          </Panel>
        </div>
      </div>

      <MediaModal
        item={selected}
        onClose={() => setSelected(null)}
        onDelete={(item) => setPendingDelete(item)}
      />

      <ConfirmModal
        open={Boolean(pendingDelete)}
        title="Delete media"
        message="Permanently delete this file from disk and remove its record?"
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmModal
        open={confirmBulkDelete}
        title="Delete selected media"
        message={`Permanently delete ${selectedIds.size} file(s) from disk and remove their records? This cannot be undone.`}
        confirmLabel="Delete"
        busy={busy}
        onConfirm={handleBulkDelete}
        onCancel={() => setConfirmBulkDelete(false)}
      />
    </>
  )
}
