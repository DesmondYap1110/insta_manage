import { ApiError, del, get, post } from './client'

const buildParams = ({ accountId, mediaType, category, year, dateFrom, dateTo } = {}) => {
  const params = new URLSearchParams()
  if (accountId) params.set('account_id', accountId)
  if (mediaType) params.set('media_type', mediaType)
  if (category) params.set('category', category)
  if (year) params.set('year', year)
  if (dateFrom) params.set('date_from', dateFrom)
  if (dateTo) params.set('date_to', dateTo)
  return params
}

export const listMedia = ({ page = 1, pageSize = 40, ...filters } = {}) => {
  const params = buildParams(filters)
  params.set('page', page)
  params.set('page_size', pageSize)
  return get(`/api/media?${params.toString()}`)
}

export const categoryCounts = (filters = {}) => {
  const params = buildParams(filters)
  const qs = params.toString()
  return get(`/api/media/categories${qs ? `?${qs}` : ''}`)
}

export const yearCounts = (filters = {}) => {
  const params = buildParams(filters)
  const qs = params.toString()
  return get(`/api/media/years${qs ? `?${qs}` : ''}`)
}

export const matchingIds = (filters = {}) => {
  const params = buildParams(filters)
  const qs = params.toString()
  return get(`/api/media/ids${qs ? `?${qs}` : ''}`)
}

export const deleteMedia = (id) => del(`/api/media/${id}`)

export const bulkDeleteMedia = (ids) => post('/api/media/bulk-delete', { ids })

// Not a plain JSON call — the response is a zip file, so this bypasses the
// shared `request()` helper (which always calls response.json()) and drives
// the download itself via a throwaway <a download> anchor.
export async function exportMedia(ids) {
  const response = await fetch('/api/media/export', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })

  if (!response.ok) {
    let detail = response.statusText
    try {
      const body = await response.json()
      detail = body.detail || detail
    } catch {
      // response wasn't JSON; fall back to statusText
    }
    throw new ApiError(detail, response.status)
  }

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'media_export.zip'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
