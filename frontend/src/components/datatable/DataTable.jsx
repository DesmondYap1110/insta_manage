import { useEffect, useMemo, useState } from 'react'

/**
 * Reusable data table — a React port of the jQuery DataTables setup used in
 * the desmondyap admin (search, page-length menu, column sorting, info line,
 * pagination, CSV/print export), styled by styles/datatable.css.
 *
 * Why not jQuery DataTables directly? It mutates the DOM itself, which fights
 * React's rendering model and breaks as soon as rows re-render from state.
 * This keeps the same look and behaviour while staying idiomatic React.
 *
 * --- React concepts used here ---
 * useMemo(fn, deps) caches an expensive calculation between renders and only
 * recomputes when something in `deps` changes. Filtering + sorting every row
 * on every keystroke would be wasteful, so each step is memoised separately.
 *
 * Column shape:
 *   { key, header, sortable?, searchable?, render?, value?, className?,
 *     headerClassName? }
 *   - render(row, index) -> what the cell displays (JSX allowed)
 *   - value(row)         -> the primitive used for sorting/search/export
 *                           (defaults to row[key]). When a cell renders more
 *                           than one field, `value` should return all of the
 *                           text so search matches what the user can see.
 *   - searchable: false  -> exclude from the search filter (row numbers,
 *                           action buttons, etc.)
 */
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

function cellValue(column, row) {
  if (typeof column.value === 'function') return column.value(row)
  return row[column.key]
}

function toText(value) {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toLocaleString()
  return String(value)
}

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

export default function DataTable({
  columns,
  rows,
  searchable = true,
  exportable = false,
  exportFilename = 'export',
  defaultPageSize = 10,
  emptyMessage = 'No records found.',
  emptyIcon = 'ri-inbox-line',
}) {
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(defaultPageSize)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState({ key: null, dir: 'asc' })

  // Filter -------------------------------------------------------------
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return rows
    const searchCols = columns.filter((column) => column.searchable !== false)
    return rows.filter((row) =>
      searchCols.some((column) => toText(cellValue(column, row)).toLowerCase().includes(term))
    )
  }, [rows, columns, search])

  // Sort ---------------------------------------------------------------
  const sorted = useMemo(() => {
    if (!sort.key) return filtered
    const column = columns.find((c) => c.key === sort.key)
    if (!column) return filtered

    // Copy before sorting — Array.sort mutates, and mutating props/state
    // directly is exactly the kind of thing that makes React render stale UI.
    return [...filtered].sort((a, b) => {
      const av = cellValue(column, a)
      const bv = cellValue(column, b)

      if (av === bv) return 0
      if (av === null || av === undefined) return 1
      if (bv === null || bv === undefined) return -1

      const result =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : toText(av).localeCompare(toText(bv), undefined, { numeric: true })

      return sort.dir === 'asc' ? result : -result
    })
  }, [filtered, columns, sort])

  // Paginate -----------------------------------------------------------
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * pageSize
  const pageRows = sorted.slice(start, start + pageSize)

  // If filtering shrinks the result set below the current page, snap back.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  function toggleSort(column) {
    if (!column.sortable) return
    setSort((prev) =>
      prev.key === column.key
        ? { key: column.key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key: column.key, dir: 'asc' }
    )
    setPage(1)
  }

  function handleExportCsv() {
    const escape = (value) => `"${toText(value).replace(/"/g, '""')}"`
    const lines = [
      columns.map((c) => escape(c.header)).join(','),
      ...sorted.map((row) => columns.map((c) => escape(cellValue(c, row))).join(',')),
    ]
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${exportFilename}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  function handlePrint() {
    const head = columns.map((c) => `<th>${toText(c.header)}</th>`).join('')
    const body = sorted
      .map(
        (row) =>
          `<tr>${columns.map((c) => `<td>${toText(cellValue(c, row))}</td>`).join('')}</tr>`
      )
      .join('')

    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <html><head><title>${exportFilename}</title>
      <style>
        body { font-family: Roboto, Arial, sans-serif; padding: 24px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { background: #012161; color: #fff; text-align: left; }
        th, td { padding: 8px 10px; border: 1px solid #dee2e6; }
      </style></head>
      <body><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>
    `)
    win.document.close()
    win.print()
  }

  const showingFrom = sorted.length === 0 ? 0 : start + 1
  const showingTo = Math.min(start + pageSize, sorted.length)

  return (
    <div className="dt">
      <div className="dt__toolbar">
        <label className="dt__length">
          Show
          <select
            className="form-select"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value))
              setPage(1)
            }}
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          entries
        </label>

        {exportable && (
          <div className="dt__export">
            <button type="button" className="dt-button" onClick={handleExportCsv}>
              <i className="ri-file-excel-2-line me-1" />
              CSV
            </button>
            <button type="button" className="dt-button" onClick={handlePrint}>
              <i className="ri-printer-line me-1" />
              Print
            </button>
          </div>
        )}

        <div className="dt__spacer" />

        {searchable && (
          <label className="dt__search">
            Search
            <input
              type="search"
              className="form-control"
              value={search}
              placeholder="Type to filter..."
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
          </label>
        )}
      </div>

      <div className="dt__scroll">
        <table>
          <thead>
            <tr>
              {columns.map((column) => {
                const isSorted = sort.key === column.key
                return (
                  <th
                    key={column.key}
                    className={[
                      column.headerClassName || '',
                      column.sortable ? 'is-sortable' : '',
                      isSorted ? 'is-sorted' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => toggleSort(column)}
                  >
                    {column.header}
                    {column.sortable && (
                      <i
                        className={`dt__sort-icon ri-arrow-${
                          isSorted && sort.dir === 'desc' ? 'down' : 'up'
                        }-s-fill`}
                      />
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td className="dt__empty" colSpan={columns.length}>
                  <i className={`${emptyIcon} d-block fs-3 mb-2 opacity-50`} />
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              pageRows.map((row, index) => (
                <tr key={row.id ?? start + index}>
                  {columns.map((column) => (
                    <td key={column.key} className={column.className}>
                      {column.render
                        ? column.render(row, start + index)
                        : toText(cellValue(column, row))}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="dt__footer">
        <div className="dt__info">
          Showing {showingFrom} to {showingTo} of {sorted.length} entries
        </div>

        {totalPages > 1 && (
          <ul className="dt__pagination">
            <li>
              <button
                type="button"
                className="dt__page"
                disabled={safePage === 1}
                onClick={() => setPage(safePage - 1)}
              >
                <i className="ri-arrow-left-s-line" />
              </button>
            </li>

            {buildPageList(safePage, totalPages).map((entry, index) =>
              entry === 'gap' ? (
                <li key={`gap-${index}`} className="dt__ellipsis">
                  &hellip;
                </li>
              ) : (
                <li key={entry}>
                  <button
                    type="button"
                    className={`dt__page${entry === safePage ? ' is-active' : ''}`}
                    onClick={() => setPage(entry)}
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
                disabled={safePage === totalPages}
                onClick={() => setPage(safePage + 1)}
              >
                <i className="ri-arrow-right-s-line" />
              </button>
            </li>
          </ul>
        )}
      </div>
    </div>
  )
}
